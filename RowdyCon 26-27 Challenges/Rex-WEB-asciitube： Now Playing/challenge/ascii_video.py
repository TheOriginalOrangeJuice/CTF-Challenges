"""yt-dlp download + OpenCV → ASCII streaming.

Shared, tier-independent. The security-relevant code lives in filters.py and
app.py; this file is just the "flavor" that turns a video into ASCII frames and
pushes them down the socket.
"""
import os
import shutil
import tempfile
import subprocess

try:
    import cv2
except Exception:  # pragma: no cover - keeps the SSRF path working without cv2
    cv2 = None

# Dark-background ramp: space = darkest pixel, '@' = brightest.
ASCII_RAMP = " .:-=+*#%@"
DEFAULT_COLS = 100
DEFAULT_FPS = 15


def frame_to_ascii(frame, cols=DEFAULT_COLS):
    """Convert a single BGR frame to an ASCII string."""
    h, w = frame.shape[:2]
    # Terminal cells are ~twice as tall as wide, so halve the row count.
    rows = max(1, int(cols * (h / w) * 0.5))
    small = cv2.resize(frame, (cols, rows), interpolation=cv2.INTER_AREA)
    gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
    n = len(ASCII_RAMP) - 1
    lines = []
    for r in range(rows):
        row = gray[r]
        lines.append("".join(ASCII_RAMP[(int(row[c]) * n) // 255] for c in range(cols)))
    return "\n".join(lines)


def bytes_look_like_video(data, sniff_dir):
    """Return a temp path if `data` decodes as a video, else None."""
    if cv2 is None or not data:
        return None
    path = os.path.join(sniff_dir, "sniff.bin")
    with open(path, "wb") as f:
        f.write(data)
    cap = cv2.VideoCapture(path)
    ok, _ = cap.read()
    cap.release()
    return path if ok else None


def download_youtube(url, dest_dir, timeout=180, max_duration=300):
    """Download a low-res copy of a YouTube (or other yt-dlp-supported) video.

    Returns the local file path. Raises RuntimeError (with yt-dlp's own error
    tail) on failure.

    max_duration: reject videos longer than this many seconds so a user request
    can't fill the disk (None disables the cap — used for our own baked/caught
    clip, which we trust).

    Current YouTube requires solving JS "signature"/"n" challenges. yt-dlp does
    that via an external JS runtime (deno, shipped in the image) plus the EJS
    solver it fetches with --remote-components ejs:github. Without both, YouTube
    formats are dropped and this fails with "Requested format is not available".
    """
    out_tmpl = os.path.join(dest_dir, "video.%(ext)s")
    # Solve YouTube's JS challenges (needs deno on PATH). Set
    # YTDLP_REMOTE_COMPONENTS="" to disable if you bundle the solver yourself.
    remote = os.environ.get("YTDLP_REMOTE_COMPONENTS", "ejs:github")
    cmd = [
        "yt-dlp",
        "--no-playlist",
        "--quiet",
        "--no-warnings",
        *(["--remote-components", remote] if remote else []),
        # Storage guard: skip anything longer than max_duration (and livestreams,
        # which have no duration). yt-dlp exits 0 and downloads nothing on a miss.
        *(["--match-filter", f"duration<={int(max_duration)}"] if max_duration else []),
        "--max-filesize", "60M",
        "--limit-rate", os.environ.get("YTDLP_LIMIT_RATE", "4M"),
        # ASCII only needs the video track, so take a video-only stream (no
        # audio, no ffmpeg merge). Soft cap (<=?480) + sort toward 360p/h264/mp4
        # so it also works for videos that only publish split DASH streams
        # (which have no muxed "best"/"worst" format at all).
        "-f", "bv*[height<=?480]/b[height<=?480]/b",
        "-S", "res:360,codec:h264,ext:mp4",
        "-o", out_tmpl,
        url,
    ]
    proc = subprocess.run(cmd, timeout=timeout, capture_output=True, text=True)
    if proc.returncode != 0:
        lines = (proc.stderr or proc.stdout or "").strip().splitlines()
        tail = " | ".join(lines[-3:]) if lines else f"yt-dlp exit {proc.returncode}"
        raise RuntimeError(tail)
    for name in os.listdir(dest_dir):
        if name.startswith("video."):
            return os.path.join(dest_dir, name)
    # rc 0 but no file: the format selector is robust, so this is almost always
    # the duration guard skipping a too-long video (or a livestream).
    if max_duration:
        raise RuntimeError(
            f"video is too long — max {int(max_duration) // 60} min (or it's a livestream)")
    raise RuntimeError("yt-dlp produced no file")


def stream_ascii(socketio, sid, path, cols=DEFAULT_COLS, fps=DEFAULT_FPS,
                 max_frames=1200):
    """Read `path` with OpenCV and emit ASCII frames to one client."""
    if cv2 is None:
        socketio.emit("status", {"msg": "video decoding unavailable on server"}, to=sid)
        return
    cap = cv2.VideoCapture(path)
    src_fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    step = max(1, int(round(src_fps / fps)))
    i = 0
    sent = 0
    while sent < max_frames:
        ok, frame = cap.read()
        if not ok:
            break
        if i % step == 0:
            socketio.emit("frame", {"art": frame_to_ascii(frame, cols)}, to=sid)
            socketio.sleep(1.0 / fps)
            sent += 1
        i += 1
    cap.release()
    socketio.emit("done", {"frames": sent}, to=sid)


def play_local_file(socketio, sid, path, banner=None):
    """Stream a local video file directly — no download, no network.

    Used for the hardcoded 'caught' video so the gag always plays even if
    YouTube/GitHub are unreachable at runtime. The file is a persistent asset
    and is NOT deleted here.
    """
    if banner:
        socketio.emit("status", {"msg": banner}, to=sid)
    if not os.path.exists(path):
        socketio.emit("status", {"msg": "caught video not installed on server"}, to=sid)
        return
    socketio.emit("status", {"msg": "playing"}, to=sid)
    stream_ascii(socketio, sid, path)


def play_youtube(socketio, sid, url, banner=None, max_duration=300):
    """Download + stream a YouTube video, cleaning up afterwards."""
    workdir = tempfile.mkdtemp(prefix="ascii_")
    try:
        if banner:
            socketio.emit("status", {"msg": banner}, to=sid)
        socketio.emit("status", {"msg": f"downloading {url} …"}, to=sid)
        path = download_youtube(url, workdir, max_duration=max_duration)
        socketio.emit("status", {"msg": "playing"}, to=sid)
        stream_ascii(socketio, sid, path)
    except subprocess.TimeoutExpired:
        socketio.emit("status", {"msg": "download timed out"}, to=sid)
    except Exception as e:  # noqa: BLE001 - surface any yt-dlp/cv2 error to the UI
        socketio.emit("status", {"msg": f"could not play video: {e}"}, to=sid)
    finally:
        shutil.rmtree(workdir, ignore_errors=True)
