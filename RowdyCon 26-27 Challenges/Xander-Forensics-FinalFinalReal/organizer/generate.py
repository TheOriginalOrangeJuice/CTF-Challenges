#!/usr/bin/env python3
"""
Author-side generator for "Final_Final_REAL" (MLG montage forensics).

Builds a crashed "Montage Studio 12" project as recovered from autosave:

  Final_Final_REAL/
    Final_Final_REAL.recovery.json   saved state + command journal since save
    media/*.png                      six 1024x768 RGBA meme overlays
    media/solarium_fragcut.webm      16 s frag reel (one-frame flash at 4.033 s)
    media/holdin_on_mlg_excerpt.wav  stereo, hint text in the L-R spectrogram

The flag is a 1000x240 1-bit image split into six XOR shares. Share k is
written into bit 0 of R, G and B of overlay k, inside the region that the
ENDCARD event for that overlay crops, and mirrored if that event is flipped.
Every other pixel's bit 0 is random, so each PNG alone is uniform noise.

Recovering the flag means compositing the six endcard events the way the
editor would (crop -> flip -> place, blend "difference" at 1 bit = XOR). The
correct crop/flip/position values only exist after replaying the journal over
the saved state with real undo/redo semantics:

  * edit.apply pushes one undo unit (all of its changes) and CLEARS redo
  * edit.undo  reverts the last unit and moves it onto the redo stack
  * edit.redo  re-applies the last undone unit (no-op if redo is empty)
  * everything else (select, seek, snapshot, play) is not undoable

The generator asserts that the common wrong replays (saved state only, last
write wins, redo stack survives a new edit, undo/redo skipped) all give a
different composite, so none of them leaks the flag.

Usage: python3 generate.py [flag]      (default: author/flag.txt)
"""
import copy
import hashlib
import json
import math
import random
import shutil
import struct
import subprocess
import sys
import tempfile
import wave
import zipfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
DIST = ROOT / "dist"
PROJECT = "Final_Final_REAL"

SEED = 0x4D4C47  # "MLG"
SRC_W, SRC_H = 1024, 768
CANVAS_W, CANVAS_H = 1152, 648
CROP_W, CROP_H = 1000, 240
FINAL_POS = (76, 204)
FPS = 30
FLASH_FRAME = 121  # 121 / 30 = 00:00:04.033, the playhead in the screenshot

BOLD_FONTS = [
    "/usr/share/fonts/liberation-sans-fonts/LiberationSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    "/usr/share/fonts/dejavu-sans-fonts/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
]
MONO_FONTS = [
    "/usr/share/fonts/liberation-mono-fonts/LiberationMono-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationMono-Bold.ttf",
    "/usr/share/fonts/dejavu-sans-mono-fonts/DejaVuSansMono-Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf",
]


def find_font(candidates):
    for p in candidates:
        if Path(p).exists():
            return p
    sys.exit(f"no usable font found, tried: {candidates}")


def font(candidates, size):
    return ImageFont.truetype(find_font(candidates), size)


# --------------------------------------------------------------------------
# Visible overlay art (deliberately crude, as is tradition)
# --------------------------------------------------------------------------

def outlined_text(d, xy, text, f, fill, outline, width):
    d.text(xy, text, font=f, fill=fill, anchor="mm",
           stroke_width=width, stroke_fill=outline)


def art_sample_text():
    im = Image.new("RGBA", (SRC_W, SRC_H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    f = font(BOLD_FONTS, 190)
    outlined_text(d, (512, 290), "SAMPLE", f, (255, 255, 255, 255), (0, 0, 0, 255), 10)
    outlined_text(d, (512, 490), "TEXT", f, (255, 255, 255, 255), (0, 0, 0, 255), 10)
    return im


def art_doritos():
    im = Image.new("RGBA", (SRC_W, SRC_H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    tri = [(250, 130), (800, 260), (430, 690)]
    d.polygon(tri, fill=(232, 120, 20, 255), outline=(120, 40, 0, 255), width=12)
    d.polygon([(330, 230), (690, 300), (450, 560)], fill=(250, 170, 40, 255))
    for x, y in [(400, 300), (520, 330), (470, 450), (600, 320), (420, 400)]:
        d.ellipse([x - 9, y - 9, x + 9, y + 9], fill=(200, 60, 10, 255))
    f = font(BOLD_FONTS, 150)
    outlined_text(d, (512, 400), "Doritos", f, (255, 255, 255, 255), (0, 0, 0, 255), 12)
    return im


def art_dew():
    im = Image.new("RGBA", (SRC_W, SRC_H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.polygon([(120, 560), (900, 160), (930, 230), (150, 630)], fill=(200, 16, 46, 255))
    f = font(BOLD_FONTS, 130)
    layer = Image.new("RGBA", (SRC_W, SRC_H), (0, 0, 0, 0))
    ld = ImageDraw.Draw(layer)
    outlined_text(ld, (500, 300), "mtn", f, (20, 160, 40, 255), (255, 255, 255, 255), 8)
    outlined_text(ld, (530, 450), "DEW", font(BOLD_FONTS, 230),
                  (20, 160, 40, 255), (255, 255, 255, 255), 10)
    layer = layer.rotate(22, resample=Image.BICUBIC, center=(512, 384))
    im.alpha_composite(layer)
    return im


def art_illuminati():
    im = Image.new("RGBA", (SRC_W, SRC_H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.polygon([(512, 60), (870, 700), (154, 700)], fill=(30, 110, 60, 255),
              outline=(10, 40, 20, 255), width=10)
    for y in range(330, 700, 55):
        w = (y - 60) * 358 // 640
        d.line([(512 - w, y), (512 + w, y)], fill=(15, 70, 35, 255), width=5)
    d.ellipse([400, 230, 624, 340], fill=(255, 255, 255, 255), outline=(0, 0, 0, 255), width=8)
    d.ellipse([478, 250, 546, 320], fill=(40, 30, 20, 255))
    d.ellipse([500, 270, 524, 296], fill=(0, 0, 0, 255))
    for a in range(0, 360, 20):
        r = math.radians(a)
        d.line([(512 + 140 * math.cos(r), 285 + 90 * math.sin(r)),
                (512 + 210 * math.cos(r), 285 + 140 * math.sin(r))],
               fill=(255, 230, 120, 200), width=6)
    return im


def art_deal_with_it():
    im = Image.new("RGBA", (SRC_W, SRC_H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    px = 32
    rows = [
        "XXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
        "XXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
        "...XWWXXXXXXXXX...XWWXXXXXXXX",
        "...XXWWXXXXXXX.....XXWWXXXXX.",
        "....XXXXXXXXX.......XXXXXXX..",
        ".....XXXXXXX.........XXXXX...",
    ]
    ox = (SRC_W - len(rows[0]) * px) // 2
    oy = 290
    for j, row in enumerate(rows):
        for i, c in enumerate(row):
            if c == ".":
                continue
            col = (255, 255, 255, 255) if c == "W" else (0, 0, 0, 255)
            d.rectangle([ox + i * px, oy + j * px, ox + (i + 1) * px - 1, oy + (j + 1) * px - 1],
                        fill=col)
    return im


def art_hitmarker():
    im = Image.new("RGBA", (SRC_W, SRC_H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    cx, cy = 512, 384
    for sx, sy in [(-1, -1), (1, -1), (-1, 1), (1, 1)]:
        a = (cx + sx * 70, cy + sy * 70)
        b = (cx + sx * 260, cy + sy * 260)
        d.line([a, b], fill=(20, 20, 20, 255), width=46)
        d.line([a, b], fill=(235, 235, 235, 255), width=30)
    return im


# (media file, track name, art fn)
OVERLAYS = [
    ("sample_text.png", "SAMPLE TEXT", art_sample_text),
    ("doritos_hd.png", "Doritos / crunch", art_doritos),
    ("dew_it.png", "Dew it", art_dew),
    ("illuminati_confirmed.png", "Confirmed", art_illuminati),
    ("deal_with_it.png", "Deal with it", art_deal_with_it),
    ("hitmarker.png", "Hitmarker", art_hitmarker),
]


# --------------------------------------------------------------------------
# Flag shares
# --------------------------------------------------------------------------

def render_flag_bits(flag):
    im = Image.new("L", (CROP_W, CROP_H), 0)
    d = ImageDraw.Draw(im)
    d.text((CROP_W // 2, 52), "// ENDCARD - FINAL PASS //", font=font(MONO_FONTS, 30),
           fill=255, anchor="mm")
    size = 64
    while size > 20:
        f = font(MONO_FONTS, size)
        l, t, r, b = d.textbbox((0, 0), flag, font=f)
        if r - l <= CROP_W - 40:
            break
        size -= 2
    d.text((CROP_W // 2, 150), flag, font=f, fill=255, anchor="mm")
    d.text((CROP_W // 2, 214), "GG NO RE", font=font(MONO_FONTS, 22), fill=255, anchor="mm")
    return bytes(1 if v >= 128 else 0 for v in im.tobytes())


def mirror_rows(bits, w, h):
    out = bytearray(len(bits))
    for y in range(h):
        row = bits[y * w:(y + 1) * w]
        out[y * w:(y + 1) * w] = row[::-1]
    return bytes(out)


def embed_lsb(art, plane):
    data = bytearray(art.tobytes())
    for i, b in enumerate(plane):
        o = i * 4
        data[o] = (data[o] & 0xFE) | b
        data[o + 1] = (data[o + 1] & 0xFE) | b
        data[o + 2] = (data[o + 2] & 0xFE) | b
    return Image.frombytes("RGBA", art.size, bytes(data))


# --------------------------------------------------------------------------
# Project + journal
# --------------------------------------------------------------------------

def get_path(ev, path):
    a, b = path.split(".")
    return ev[a][b]


def set_path(ev, path, value):
    a, b = path.split(".")
    ev[a][b] = value


def replay(events, journal, mode="correct"):
    """Return {event_id: event} after replaying `journal` over `events`.

    mode:
      correct         real linear undo/redo
      saved           ignore the journal
      last_write      every edit.apply wins, undo/redo ignored
      sticky_redo     like correct, but a new apply does not clear redo
    """
    state = {e["id"]: copy.deepcopy(e) for e in events}
    if mode == "saved":
        return state
    undo, redo = [], []
    for ent in journal:
        cmd = ent["cmd"]
        if cmd == "edit.apply":
            old = [(c["event"], c["path"], get_path(state[c["event"]], c["path"]))
                   for c in ent["changes"]]
            for c in ent["changes"]:
                set_path(state[c["event"]], c["path"], c["value"])
            undo.append((ent["changes"], old))
            if mode != "sticky_redo":
                redo.clear()
        elif mode == "last_write":
            continue
        elif cmd == "edit.undo":
            if undo:
                changes, old = undo.pop()
                for ev, path, val in reversed(old):
                    set_path(state[ev], path, val)
                redo.append((changes, old))
        elif cmd == "edit.redo":
            if redo:
                changes, old = redo.pop()
                for c in changes:
                    set_path(state[c["event"]], c["path"], c["value"])
                undo.append((changes, old))
    return state


def endcard_params(state, endcard_ids):
    return [(state[i]["pan_crop"]["x"], state[i]["pan_crop"]["y"],
             state[i]["transform"]["flip_h"],
             state[i]["transform"]["x"], state[i]["transform"]["y"]) for i in endcard_ids]


class Journal:
    def __init__(self, rng):
        self.rng = rng
        self.entries = []
        self.clock = 15 * 3600 + 58 * 60 + 7  # 15:58:07 local, 2013-07-12

    def _push(self, cmd, **kw):
        self.clock += self.rng.randint(1, 9)
        h, m, s = self.clock // 3600, self.clock // 60 % 60, self.clock % 60
        ent = {"seq": len(self.entries) + 1, "t": f"2013-07-12T{h:02d}:{m:02d}:{s:02d}",
               "cmd": cmd}
        ent.update(kw)
        self.entries.append(ent)

    def apply(self, label, changes):
        self._push("edit.apply", label=label,
                   changes=[{"event": e, "path": p, "value": v} for e, p, v in changes])

    def crop(self, ev, x, y):
        self.apply("Pan/Crop", [(ev, "pan_crop.x", x), (ev, "pan_crop.y", y)])

    def move(self, ev, x, y):
        self.apply("Move", [(ev, "transform.x", x), (ev, "transform.y", y)])

    def flip(self, ev, v):
        self.apply("Flip horizontal", [(ev, "transform.flip_h", v)])

    def undo(self):
        self._push("edit.undo", via="Ctrl+Z")

    def redo(self):
        self._push("edit.redo", via="Ctrl+Y")

    def select(self, ev):
        self._push("ui.select", event=ev)

    def seek(self, t):
        self._push("transport.seek", position=t)

    def snapshot(self, name):
        self._push("preview.snapshot", file=f"snapshots/{name}.png", note="not included in recovery")

    def play(self):
        self._push("transport.play")


def build_project(rng, finals):
    """finals: list of (cx, cy, flip) for the six endcard events, in OVERLAYS order."""
    tracks, events = [], []
    reel_slots = [(0.0, 3.3), (2.0, 5.6), (5.5, 8.6), (8.3, 11.6), (11.2, 14.1), (13.8, 16.0)]
    for i, (fname, tname, _) in enumerate(OVERLAYS):
        tid = f"trk_{i + 1}"
        tracks.append({"id": tid, "index": i + 1, "name": tname, "mute": False, "solo": False})
        t0, t1 = reel_slots[i]
        short = tname.split(" / ")[0] if i != 1 else "Doritos / crunch"
        events.append({
            "id": f"ev_{i + 1:02d}", "track": tid, "media": fname,
            "label": f"{short} / reel", "start": t0, "end": t1,
            "pan_crop": {"x": rng.randint(0, 24), "y": rng.randint(0, 528),
                         "w": CROP_W, "h": CROP_H},
            "transform": {"x": rng.randint(0, 152), "y": rng.randint(0, 408),
                          "flip_h": rng.random() < 0.5},
            "blend": "normal", "opacity": 1.0,
        })
    for i, (fname, tname, _) in enumerate(OVERLAYS):
        short = tname.split(" / ")[0] if i != 1 else "Doritos / crunch"
        fx, fy, ff = finals[i]
        # Stale saved values: never equal to the final ones.
        sx = (fx + rng.randint(3, 21)) % 25
        sy = (fy + rng.randint(40, 480)) % 529
        events.append({
            "id": f"ev_{i + 7:02d}", "track": f"trk_{i + 1}", "media": fname,
            "label": f"{short} / endcard", "start": 16.0, "end": 20.0,
            "pan_crop": {"x": sx, "y": sy, "w": CROP_W, "h": CROP_H},
            # flip traps (1, 4) start from the wrong orientation
            "transform": {"x": FINAL_POS[0], "y": FINAL_POS[1],
                          "flip_h": (not ff) if i in (1, 4) else ff},
            "blend": "difference", "opacity": 1.0,
        })
    tracks.append({"id": "trk_7", "index": 7, "name": "Solarium / frag reel",
                   "mute": False, "solo": False})
    events.append({
        "id": "ev_13", "track": "trk_7", "media": "solarium_fragcut.webm",
        "label": "solarium_fragcut.webm", "start": 0.0, "end": 16.0,
        "pan_crop": {"x": 0, "y": 0, "w": 640, "h": 360},
        "transform": {"x": 0, "y": 0, "flip_h": False, "scale": 1.8},
        "blend": "normal", "opacity": 1.0,
    })
    return tracks, events


def build_journal(rng, finals):
    """Script the session so every naive replay lands on a wrong value."""
    J = Journal(rng)
    E = [f"ev_{i + 7:02d}" for i in range(6)]
    R = [f"ev_{i + 1:02d}" for i in range(6)]

    def decoy(i):
        fx, fy, _ = finals[i]
        return (fx + rng.randint(1, 24)) % 25, (fy + rng.randint(30, 500)) % 529

    def reel_noise():
        r = rng.choice(R)
        J.select(r)
        J.crop(r, rng.randint(0, 24), rng.randint(0, 528))
        if rng.random() < 0.5:
            J.move(r, rng.randint(0, 152), rng.randint(0, 408))

    J.seek(0.0)
    J.play()
    reel_noise()
    J.seek(16.0)
    J.snapshot("endcard_before")

    # 0 SAMPLE TEXT: new edit after undo must kill redo (sticky_redo trap)
    i = 0
    J.select(E[i])
    J.crop(E[i], *decoy(i))
    J.undo()
    J.crop(E[i], finals[i][0], finals[i][1])
    J.seek(4.033)
    J.redo()  # nothing to redo
    reel_noise()

    # 1 Doritos: final, then a later drag that gets undone (last_write trap)
    i = 1
    J.select(E[i])
    J.crop(E[i], finals[i][0], finals[i][1])
    J.snapshot("endcard_doritos")
    J.crop(E[i], *decoy(i))
    J.undo()
    # flip set, then toggled back and that toggle undone
    J.flip(E[i], finals[i][2])
    J.flip(E[i], not finals[i][2])
    J.undo()

    # 2 Dew it: final, undone, redone (a "skip undone edits" replay keeps stale)
    i = 2
    J.select(E[i])
    J.crop(E[i], finals[i][0], finals[i][1])
    J.undo()
    J.seek(17.2)
    J.redo()
    reel_noise()

    # 3 Confirmed: double undo then double redo, then a y-only nudge undone
    i = 3
    J.select(E[i])
    d = decoy(i)
    J.crop(E[i], *d)
    J.crop(E[i], finals[i][0], finals[i][1])
    J.undo()
    J.undo()
    J.redo()
    J.redo()
    J.apply("Pan/Crop", [(E[i], "pan_crop.y", d[1])])
    J.undo()
    J.snapshot("endcard_confirmed")

    # 4 Deal with it: flip trap (final flip set, decoy flip after undo kills redo)
    i = 4
    J.select(E[i])
    J.crop(E[i], finals[i][0], finals[i][1])
    J.flip(E[i], finals[i][2])
    J.undo()
    J.move(E[i], FINAL_POS[0] + 40, FINAL_POS[1] - 30)
    J.undo()
    J.flip(E[i], finals[i][2])
    J.redo()  # nothing to redo
    reel_noise()

    # 5 Hitmarker: moved off and undone; crop set via redo after unrelated undo chain
    i = 5
    J.select(E[i])
    J.move(E[i], FINAL_POS[0] - 12, FINAL_POS[1] + 66)
    J.crop(E[i], finals[i][0], finals[i][1])
    J.undo()
    J.undo()
    J.redo()
    J.undo()
    J.redo()
    J.redo()
    J.move(E[i], FINAL_POS[0], FINAL_POS[1])

    J.seek(16.0)
    J.snapshot("endcard_final_pass")
    J.play()
    # Crash happened here: Ctrl+S was pressed but never committed.
    J._push("file.save", status="interrupted")

    return J.entries


# --------------------------------------------------------------------------
# Video + audio
# --------------------------------------------------------------------------

def make_video(out):
    bold = find_font(BOLD_FONTS)
    mono = find_font(MONO_FONTS)
    tmp = Path(tempfile.mkdtemp())
    texts = {
        "title": "SOLARIUM // FRAGCUT",
        "qs": "QUICKSCOPED",
        "plus": "+100",
        "wombo": "WOMBO COMBO",
        "flash1": "ENDCARD BLEND = DIFFERENCE",
        "flash2": "DEPTH = 1 BIT (LSB)",
        "hud": "113",
    }
    for k, v in texts.items():
        (tmp / f"{k}.txt").write_text(v)

    def dt(name, f, size, x, y, color, enable, box=""):
        return (f"drawtext=fontfile='{f}':textfile='{tmp / (name + '.txt')}':"
                f"fontsize={size}:fontcolor={color}:x={x}:y={y}:borderw=3:bordercolor=black"
                f"{box}:enable='{enable}'")

    vf = ",".join([
        "hue=h=t*45:s=1.6",
        "noise=alls=6",
        "drawgrid=w=80:h=60:t=2:c=white@0.25",
        "drawbox=x=310:y=170:w=20:h=20:color=white@0.8:t=2",
        "drawbox=x=0:y=300:w=640:h=60:color=black@0.45:t=fill",
        dt("hud", mono, 28, 300, 318, "red", "1"),
        dt("title", bold, 34, "(w-text_w)/2", 18, "white", "lt(t,2.5)"),
        dt("qs", bold, 60, "(w-text_w)/2+10*sin(40*t)", 140, "yellow", "between(t,2.6,3.6)"),
        dt("plus", bold, 46, 420, 90, "white", "between(t,6,6.8)+between(t,9.2,9.9)"),
        dt("wombo", bold, 64, "(w-text_w)/2", "150+8*sin(30*t)", "cyan", "between(t,11.5,13)"),
        f"drawbox=x=0:y=0:w=640:h=360:color=black:t=fill:enable='eq(n,{FLASH_FRAME})'",
        dt("flash1", mono, 34, "(w-text_w)/2", 140, "white", f"eq(n,{FLASH_FRAME})"),
        dt("flash2", mono, 34, "(w-text_w)/2", 190, "white", f"eq(n,{FLASH_FRAME})"),
    ])
    cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
           "-f", "lavfi", "-i", f"gradients=s=640x360:r={FPS}:c0=0x0a1a3a:c1=0x2a9df4:c2=0xff6a00:nb_colors=3:speed=0.08",
           "-t", "16", "-vf", vf, "-an", "-pix_fmt", "yuv420p",
           "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "38", "-row-mt", "1",
           "-deadline", "good", "-cpu-used", "4",
           "-force_key_frames", f"expr:eq(n,{FLASH_FRAME})",
           "-metadata", "title=solarium fragcut (360p proxy)", str(out)]
    subprocess.run(cmd, check=True)
    shutil.rmtree(tmp)


def make_audio(out, rng):
    sr = 22050
    dur = 10.0
    n = int(sr * dur)
    # Spectrogram text for the side channel
    f = font(BOLD_FONTS, 30)
    msg = "A NEW EDIT KILLS THE REDO STACK"
    probe = ImageDraw.Draw(Image.new("L", (1, 1)))
    l, t, r, b = probe.textbbox((0, 0), msg, font=f)
    tw, th = r - l + 20, b - t + 12
    bmp = Image.new("L", (tw, th), 0)
    ImageDraw.Draw(bmp).text((10 - l, 6 - t), msg, font=f, fill=255)
    bmp = bmp.resize((tw, 48), Image.BILINEAR)
    cols, rows = bmp.size
    px = bmp.load()
    f_lo, f_hi = 3500.0, 9500.0
    freqs = [f_hi - (f_hi - f_lo) * k / (rows - 1) for k in range(rows)]
    t0, t1 = 0.8, 9.2
    side = [0.0] * n
    s0, s1 = int(t0 * sr), int(t1 * sr)
    span = s1 - s0
    for k, fr in enumerate(freqs):
        w = 2 * math.pi * fr / sr
        ph = rng.random() * 2 * math.pi
        for s in range(s0, s1):
            c = (s - s0) * cols // span
            a = px[c, k]
            if a:
                side[s] += (a / 255.0) * math.sin(w * s + ph)
    peak = max(abs(v) for v in side) or 1.0
    side = [0.05 * v / peak for v in side]

    # Mid: four-on-the-floor kick, saw stab arp, "airhorn" bursts
    bpm = 140
    beat = 60.0 / bpm
    notes = [220.0, 261.63, 329.63, 392.0]
    mid = [0.0] * n
    for s in range(n):
        tt = s / sr
        bt = tt % beat
        kick = math.sin(2 * math.pi * (50 + 120 * math.exp(-bt * 30)) * bt) * math.exp(-bt * 9)
        step = int(tt / (beat / 2)) % len(notes)
        st = tt % (beat / 2)
        fr = notes[step]
        saw = ((tt * fr) % 1.0) * 2 - 1
        arp = 0.18 * saw * math.exp(-st * 10)
        horn = 0.0
        for h0 in (2.0, 2.35, 2.7, 6.0, 6.35, 6.7):
            if h0 <= tt < h0 + 0.28:
                ht = tt - h0
                for det in (0.0, 3.0, -4.0):
                    horn += ((ht * (466.16 + det)) % 1.0) * 2 - 1
                horn *= 0.12 * min(1.0, ht * 60) * min(1.0, (h0 + 0.28 - tt) * 40)
        mid[s] = 0.5 * kick + arp + horn
    peak = max(abs(v) for v in mid) or 1.0
    mid = [0.75 * v / peak for v in mid]

    frames = bytearray()
    for m, sd in zip(mid, side):
        L = max(-1.0, min(1.0, m + sd))
        R = max(-1.0, min(1.0, m - sd))
        frames += struct.pack("<hh", int(L * 32767), int(R * 32767))
    with wave.open(str(out), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(bytes(frames))


# --------------------------------------------------------------------------

def sha256(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()


def composite(planes, params):
    canvas = bytearray(CANVAS_W * CANVAS_H)
    for plane, (cx, cy, flip, px, py) in zip(planes, params):
        for y in range(CROP_H):
            row = plane[(cy + y) * SRC_W + cx:(cy + y) * SRC_W + cx + CROP_W]
            if flip:
                row = row[::-1]
            ty = py + y
            if not 0 <= ty < CANVAS_H:
                continue
            for x, b in enumerate(row):
                tx = px + x
                if 0 <= tx < CANVAS_W:
                    canvas[ty * CANVAS_W + tx] ^= b
    return bytes(canvas)


def main():
    flag = sys.argv[1] if len(sys.argv) > 1 else (HERE / "flag.txt").read_text().strip()
    rng = random.Random(SEED)

    finals = [(rng.randint(0, 24), rng.randint(0, 528), rng.random() < 0.5) for _ in OVERLAYS]
    finals[1] = (finals[1][0], finals[1][1], True)   # flip traps need a real flip
    finals[4] = (finals[4][0], finals[4][1], True)

    # Shares in canvas orientation; XOR of all six = flag bits
    flag_bits = render_flag_bits(flag)
    shares = [rng.randbytes(CROP_W * CROP_H) for _ in range(5)]
    last = bytearray(flag_bits)
    for s in shares:
        for j in range(len(last)):
            last[j] ^= s[j] & 1
    shares = [bytes(b & 1 for b in s) for s in shares] + [bytes(last)]

    work = DIST / PROJECT
    if work.exists():
        shutil.rmtree(work)
    (work / "media").mkdir(parents=True)

    planes = []
    for (fname, _, artfn), share, (cx, cy, flip) in zip(OVERLAYS, shares, finals):
        plane = bytearray(b & 1 for b in rng.randbytes(SRC_W * SRC_H))
        src = mirror_rows(share, CROP_W, CROP_H) if flip else share
        for y in range(CROP_H):
            o = (cy + y) * SRC_W + cx
            plane[o:o + CROP_W] = src[y * CROP_W:(y + 1) * CROP_W]
        planes.append(bytes(plane))
        embed_lsb(artfn(), plane).save(work / "media" / fname, optimize=True)
        print(f"[+] {fname}")

    make_video(work / "media" / "solarium_fragcut.webm")
    print("[+] solarium_fragcut.webm")
    make_audio(work / "media" / "holdin_on_mlg_excerpt.wav", rng)
    print("[+] holdin_on_mlg_excerpt.wav")

    media = []
    for fname, _, _ in OVERLAYS:
        p = work / "media" / fname
        media.append({"name": fname, "path": f"media/{fname}", "kind": "image",
                      "width": SRC_W, "height": SRC_H, "format": "RGBA 8-bit",
                      "bytes": p.stat().st_size, "sha256": sha256(p)})
    for fname, kind, extra in [("solarium_fragcut.webm", "video",
                                {"duration": 16.0, "fps": FPS, "width": 640, "height": 360}),
                               ("holdin_on_mlg_excerpt.wav", "audio",
                                {"duration": 10.0, "channels": 2, "rate": 22050})]:
        p = work / "media" / fname
        media.append({"name": fname, "path": f"media/{fname}", "kind": kind, **extra,
                      "bytes": p.stat().st_size, "sha256": sha256(p)})

    tracks, events = build_project(rng, finals)
    journal = build_journal(rng, finals)

    endcard_ids = [f"ev_{i + 7:02d}" for i in range(6)]
    want = [(cx, cy, fl, *FINAL_POS) for cx, cy, fl in finals]
    got = endcard_params(replay(events, journal, "correct"), endcard_ids)
    assert got == want, f"replay mismatch:\n{got}\n{want}"
    for mode in ("saved", "last_write", "sticky_redo"):
        bad = endcard_params(replay(events, journal, mode), endcard_ids)
        assert bad != want, f"naive replay '{mode}' leaks the flag"
        print(f"[+] naive replay '{mode}' -> {sum(a != b for a, b in zip(bad, want))}/6 events wrong")

    canvas = composite(planes, want)
    region = b"".join(
        canvas[(FINAL_POS[1] + y) * CANVAS_W + FINAL_POS[0]:
               (FINAL_POS[1] + y) * CANVAS_W + FINAL_POS[0] + CROP_W] for y in range(CROP_H))
    assert region == flag_bits, "composite does not reproduce the flag"
    Image.frombytes("L", (CANVAS_W, CANVAS_H), bytes(255 * b for b in canvas)).save(
        HERE / "expected_endcard.png")

    project = {
        "app": "Montage Studio 12", "app_version": "12.0.4417",
        "format": "msproj-recovery/2",
        "project": {
            "name": PROJECT, "canvas": {"width": CANVAS_W, "height": CANVAS_H},
            "fps": FPS, "duration": 20.0, "color": "RGB 8-bit", "pixel_aspect": "square",
            "last_saved": "2013-07-12T15:57:41",
        },
        "recovery": {
            "reason": "unclean shutdown",
            "autosave": "2013-07-12T16:20:03",
            "note": ("'saved_state' is the project as of last_saved. 'journal' lists every "
                     "command issued since then, in order. Replay the journal over the saved "
                     "state to recover the session."),
        },
        "render_order": ("tracks are composited bottom (highest index) to top; each event: "
                         "pan_crop (source px) -> transform.flip_h -> placed at "
                         "transform.x/y on the canvas -> blend"),
        "media": media,
        "markers": [
            {"index": 1, "time": 0.0, "name": "FRAG REEL"},
            {"index": 2, "time": 16.0, "name": "ENDCARD", "comment": "final pass"},
        ],
        "ui": {"playhead": 4.033, "selection": "ev_07", "preview": "full",
               "guides": True, "volume": 0.55},
        "saved_state": {"tracks": tracks, "events": events},
        "journal": journal,
    }
    (work / f"{PROJECT}.recovery.json").write_text(json.dumps(project, indent=2) + "\n")
    print(f"[+] {PROJECT}.recovery.json ({len(journal)} journal entries)")

    zpath = DIST / f"{PROJECT}.zip"
    with zipfile.ZipFile(zpath, "w", zipfile.ZIP_DEFLATED) as z:
        for p in sorted(work.rglob("*")):
            if p.is_file():
                zi = zipfile.ZipInfo(str(p.relative_to(DIST)), date_time=(2013, 7, 12, 16, 20, 3))
                zi.compress_type = zipfile.ZIP_DEFLATED
                zi.external_attr = 0o644 << 16
                z.writestr(zi, p.read_bytes())
    print(f"[+] {zpath}")


if __name__ == "__main__":
    main()
