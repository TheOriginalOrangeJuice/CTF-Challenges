"""asciitube — public player + SSRF sink.

This file is IDENTICAL across the three tiers. The only thing that changes
between easy/medium/hard is filters.py (how a submitted URL is validated).

Flow for a submitted URL:
  1. filters.check(url)  -> (allowed, reason)
  2. blocked            -> play the configured "caught" troll video
  3. allowed + youtube  -> download with yt-dlp, stream as ASCII
  4. allowed + anything -> fetch server-side (the SSRF sink); if it decodes as
                           video, stream it; otherwise reflect the body back
                           (this is where an internal /flag leaks out)
"""
import os
import time
import tempfile
import shutil
import threading
from urllib.parse import urlparse

import requests
from flask import Flask, render_template, request
from flask_socketio import SocketIO

import filters
import internal
import config
from ascii_video import (play_youtube, play_local_file, stream_ascii,
                         bytes_look_like_video, download_youtube)

app = Flask(__name__)
app.config["SECRET_KEY"] = os.urandom(16)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="threading")

# The HTTP client follows redirects. For HARD this is the intended bug: the
# filter validates the submitted URL, but a 302 can send the fetch somewhere
# that was never checked.
FOLLOW_REDIRECTS = True
FETCH_TIMEOUT = 8
REFLECT_LIMIT = 4000
READ_LIMIT = 1_000_000  # cap how much we pull from the SSRF target

YOUTUBE_HOSTS = {"youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"}

# --- Rate limiting: per-client sliding window over the 'play' action. Stops the
# challenge being used as a free SSRF proxy / download bot or DoS'd. ---
RATE_MAX = int(os.environ.get("RATE_MAX", "5"))         # plays allowed …
RATE_WINDOW = int(os.environ.get("RATE_WINDOW", "60"))  # … per this many seconds
_rate_lock = threading.Lock()
_rate_hits = {}  # client id -> [timestamps]
_caught_lock = threading.Lock()  # serialize the one-time caught-video fetch


def rate_ok(client):
    """Return (allowed, retry_after_seconds) for this client."""
    now = time.time()
    with _rate_lock:
        hits = [t for t in _rate_hits.get(client, []) if now - t < RATE_WINDOW]
        if len(hits) >= RATE_MAX:
            _rate_hits[client] = hits
            return False, int(RATE_WINDOW - (now - hits[0])) + 1
        hits.append(now)
        _rate_hits[client] = hits
        return True, 0


def play_caught(sid, banner):
    """Play the hardcoded 'caught' video from local disk.

    If it isn't baked into the image (e.g. the build had no network), fetch it
    once into the media dir and reuse it from then on — that download is kept,
    not deleted, since it becomes the installed asset.
    """
    path = config.CAUGHT_FILE
    if os.path.exists(path):
        play_local_file(socketio, sid, path, banner=banner)
        return
    with _caught_lock:
        if not os.path.exists(path):  # re-check inside the lock
            try:
                os.makedirs(os.path.dirname(path), exist_ok=True)
                tmp = tempfile.mkdtemp(prefix="caught_")
                # Our own clip — exempt from the user duration cap.
                dl = download_youtube(config.CAUGHT_VIDEO_URL, tmp, max_duration=None)
                shutil.move(dl, path)
                shutil.rmtree(tmp, ignore_errors=True)
            except Exception as e:  # noqa: BLE001
                socketio.emit("status", {
                    "msg": f"{banner} (but caught video is unavailable: {e})"}, to=sid)
                return
    play_local_file(socketio, sid, path, banner=banner)


def is_youtube(url):
    try:
        host = (urlparse(url).hostname or "").lower()
    except ValueError:
        return False
    return host in YOUTUBE_HOSTS


def ssrf_fetch_and_reflect(sid, url):
    """Fetch `url` server-side and either play it or reflect the body."""
    socketio.emit("status", {"msg": f"fetching {url} …"}, to=sid)
    try:
        resp = requests.get(
            url,
            timeout=FETCH_TIMEOUT,
            allow_redirects=FOLLOW_REDIRECTS,
            headers={"User-Agent": "asciitube/1.0"},
            stream=True,
        )
        data = resp.raw.read(READ_LIMIT, decode_content=True) or b""
    except requests.RequestException as e:
        socketio.emit("status", {"msg": f"fetch failed: {e}"}, to=sid)
        return

    workdir = tempfile.mkdtemp(prefix="sniff_")
    try:
        video_path = bytes_look_like_video(data, workdir)
        if video_path:
            socketio.emit("status", {"msg": "decoded a video — playing"}, to=sid)
            stream_ascii(socketio, sid, video_path)
            return
        # Not a video: tell the user what we got back. (The leak.)
        body = data[:REFLECT_LIMIT].decode("utf-8", "replace")
        socketio.emit("server_response", {
            "status": resp.status_code,
            "final_url": resp.url,
            "content_type": resp.headers.get("Content-Type", ""),
            "body": body,
        }, to=sid)
        socketio.emit("status", {
            "msg": "couldn't decode that as a video — showing the raw server response above",
        }, to=sid)
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


def play_job(sid, url):
    url = (url or "").strip()
    if not url:
        socketio.emit("status", {"msg": "enter a URL"}, to=sid)
        return

    # Global anti-abuse gate (all tiers): the player is for YouTube only, so a
    # URL with no "youtube" in it anywhere is refused outright — this keeps the
    # box from being used to pull arbitrary large/random content. It's a coarse
    # substring check, not the tier's SSRF filter; the download size (60M),
    # duration (5 min) and rate limits bound what a passing request can do.
    if "youtube" not in url.lower():
        socketio.emit("status",
                      {"msg": "⛔ only YouTube links can be played"}, to=sid)
        return

    allowed, reason = filters.check(url)
    if not allowed:
        play_caught(sid, banner=f"🚨 request blocked ({reason}) — enjoy this instead")
        return

    if is_youtube(url):
        play_youtube(socketio, sid, url)
    else:
        ssrf_fetch_and_reflect(sid, url)


@app.route("/")
def index():
    return render_template("index.html",
                           difficulty=config.DIFFICULTY,
                           label=config.LABEL)


@socketio.on("play")
def on_play(payload):
    sid = request.sid
    client = request.remote_addr or sid
    ok, retry = rate_ok(client)
    if not ok:
        socketio.emit("status",
                      {"msg": f"⏳ rate limited — try again in {retry}s"}, to=sid)
        return
    url = (payload or {}).get("url", "")
    socketio.start_background_task(play_job, sid, url)


def main():
    # Internal flag service: 0.0.0.0:9000 inside the container, never published.
    socketio.start_background_task(internal.run)
    port = int(os.environ.get("PORT", "5000"))
    socketio.run(app, host="0.0.0.0", port=port, allow_unsafe_werkzeug=True)


if __name__ == "__main__":
    main()
