"""
Generate ORIGINAL homage artwork (animated GIFs) for the Lucky Channel site.

These are hand-drawn-in-code pixel graphics -- an homage to the Lucky Star
vibe, NOT copyrighted anime frames. Run at build time; outputs land in
static/img/.  Requires Pillow.
"""
import os
import math
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "static", "img")
os.makedirs(OUT, exist_ok=True)


def font(size):
    for p in (
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ):
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


# ---------------------------------------------------------------------------
# a cute chibi head (original art). hair color + a distinguishing feature mark
# each one so the four leads read as different characters.
# ---------------------------------------------------------------------------
def chibi(d, cx, cy, hair, feature, bob=0):
    cy += bob
    skin = (255, 226, 205)
    # hair back (for long-hair characters)
    if feature in ("twintail", "longpink", "longteal"):
        d.ellipse([cx - 26, cy - 20, cx + 26, cy + 34], fill=hair)
    # face
    d.ellipse([cx - 20, cy - 18, cx + 20, cy + 20], fill=skin, outline=(120, 80, 60))
    # hair cap / bangs
    d.pieslice([cx - 22, cy - 24, cx + 22, cy + 10], 180, 360, fill=hair)
    d.rectangle([cx - 22, cy - 10, cx - 16, cy + 6], fill=hair)
    d.rectangle([cx + 16, cy - 10, cx + 22, cy + 6], fill=hair)
    # eyes (big chibi)
    for ex in (-9, 9):
        d.ellipse([cx + ex - 5, cy - 4, cx + ex + 5, cy + 8], fill=(255, 255, 255),
                  outline=(60, 40, 40))
        d.ellipse([cx + ex - 3, cy, cx + ex + 3, cy + 7], fill=(40, 40, 60))
        d.ellipse([cx + ex - 2, cy + 1, cx + ex, cy + 3], fill=(255, 255, 255))
    # mouth
    d.arc([cx - 4, cy + 8, cx + 4, cy + 15], 0, 180, fill=(170, 80, 80), width=2)
    # blush
    d.ellipse([cx - 16, cy + 4, cx - 10, cy + 8], fill=(255, 180, 190))
    d.ellipse([cx + 10, cy + 4, cx + 16, cy + 8], fill=(255, 180, 190))

    # distinguishing features
    if feature == "longteal":            # Konata: ahoge cowlick
        d.line([cx - 2, cy - 22, cx - 6, cy - 34], fill=hair, width=3)
        d.line([cx - 6, cy - 34, cx + 2, cy - 30], fill=hair, width=3)
    if feature == "twintail":            # Kagami: two side tails + ribbons
        d.ellipse([cx - 34, cy - 6, cx - 22, cy + 30], fill=hair)
        d.ellipse([cx + 22, cy - 6, cx + 34, cy + 30], fill=hair)
        d.polygon([(cx - 30, cy - 10), (cx - 36, cy - 16), (cx - 24, cy - 16)], fill=(220, 60, 90))
        d.polygon([(cx + 30, cy - 10), (cx + 36, cy - 16), (cx + 24, cy - 16)], fill=(220, 60, 90))
    if feature == "clip":                # Tsukasa: little hairclip
        d.rectangle([cx + 10, cy - 20, cx + 18, cy - 16], fill=(255, 215, 0))
    if feature in ("longpink", "glasses"):  # Miyuki: glasses
        d.ellipse([cx - 13, cy - 2, cx - 4, cy + 7], outline=(80, 80, 110), width=2)
        d.ellipse([cx + 4, cy - 2, cx + 13, cy + 7], outline=(80, 80, 110), width=2)
        d.line([cx - 4, cy + 1, cx + 4, cy + 1], fill=(80, 80, 110), width=2)


LEADS = [
    ((80, 210, 200), "longteal"),   # Konata  (teal)
    ((190, 150, 220), "twintail"),  # Kagami  (lavender twin-tails)
    ((210, 170, 210), "clip"),      # Tsukasa (soft pink, clip)
    ((240, 150, 180), "longpink"),  # Miyuki  (pink + glasses)
]


def draw_star(d, cx, cy, r, fill, rot=0.0):
    pts = []
    for i in range(10):
        ang = rot + i * math.pi / 5 - math.pi / 2
        rad = r if i % 2 == 0 else r * 0.42
        pts.append((cx + rad * math.cos(ang), cy + rad * math.sin(ang)))
    d.polygon(pts, fill=fill)


# --- star_sparkle.gif ------------------------------------------------------
def make_star():
    frames = []
    for i in range(12):
        im = Image.new("RGB", (96, 96), (26, 0, 51))
        d = ImageDraw.Draw(im)
        rot = i * (math.pi / 30)
        pulse = 34 + 6 * math.sin(i / 12 * 2 * math.pi)
        draw_star(d, 48, 48, pulse + 8, (255, 120, 210), rot)
        draw_star(d, 48, 48, pulse, (255, 240, 120), rot)
        # sparkle cross
        s = 6 + 10 * abs(math.sin(i / 12 * 2 * math.pi))
        for a in (0, math.pi / 2, math.pi, 3 * math.pi / 2):
            d.line([48, 48, 48 + s * 2 * math.cos(a), 48 + s * 2 * math.sin(a)],
                   fill=(255, 255, 255), width=1)
        frames.append(im.convert("P", palette=Image.ADAPTIVE))
    frames[0].save(os.path.join(OUT, "star_sparkle.gif"), save_all=True,
                   append_images=frames[1:], duration=80, loop=0, disposal=2)


# --- construction.gif ------------------------------------------------------
def make_construction():
    W, H = 340, 38
    frames = []
    f = font(16)
    for off in range(0, 32, 4):
        im = Image.new("RGB", (W, H), (255, 204, 0))
        d = ImageDraw.Draw(im)
        for x in range(-32 + off, W, 32):
            d.polygon([(x, 0), (x + 16, 0), (x, H), (x - 16, H)], fill=(20, 20, 20))
        bar = Image.new("RGB", (W, H), (255, 204, 0))
        bd = ImageDraw.Draw(bar)
        for x in range(-32 + off, W, 32):
            bd.polygon([(x, 0), (x + 16, 0), (x, H), (x - 16, H)], fill=(20, 20, 20))
        d.rectangle([6, 9, W - 6, H - 9], fill=(255, 255, 255))
        txt = "UNDER CONSTRUCTION"
        tw = d.textlength(txt, font=f)
        d.text(((W - tw) / 2, 10), txt, fill=(200, 0, 0), font=f)
        frames.append(im.convert("P", palette=Image.ADAPTIVE))
    frames[0].save(os.path.join(OUT, "construction.gif"), save_all=True,
                   append_images=frames[1:], duration=90, loop=0, disposal=2)


# --- op_clip.gif  (the "video": the four leads doing the OP bob) -----------
def make_opclip():
    W, H = 280, 150
    frames = []
    big = font(13)
    msg = "    MOTTEKE ! MOTTEKE ! SAILOR FUKU ! ~ Lucky Channel OP ~    "
    for i in range(16):
        im = Image.new("RGB", (W, H), (51, 0, 51))
        d = ImageDraw.Draw(im)
        # starry bg
        for sx, sy in [(20, 20), (60, 110), (120, 30), (200, 90), (250, 25),
                       (160, 120), (90, 60), (240, 130)]:
            draw_star(d, sx, sy, 5, (255, 230, 120), i / 16 * math.pi)
        # the four leads bobbing out of phase
        for n, (hair, feat) in enumerate(LEADS):
            cx = 46 + n * 63
            bob = int(10 * math.sin(i / 16 * 2 * math.pi + n * math.pi / 2))
            chibi(d, cx, 62, hair, feat, bob=bob)
            # little waving note
            if (i + n) % 4 < 2:
                d.text((cx + 14, 30 + bob), "♪", fill=(255, 255, 120), font=big)
        # scrolling marquee strip
        d.rectangle([0, H - 20, W, H], fill=(20, 0, 20))
        shift = (i * 16) % (len(msg) * 7)
        d.text((W - shift, H - 18), msg + msg, fill=(255, 240, 120), font=big)
        frames.append(im.convert("P", palette=Image.ADAPTIVE))
    frames[0].save(os.path.join(OUT, "op_clip.gif"), save_all=True,
                   append_images=frames[1:], duration=110, loop=0, disposal=2)


# --- static portraits (PNG) for the "fave charas" sidebar ------------------
def make_portraits():
    names = ["konata", "kagami", "tsukasa", "miyuki"]
    for name, (hair, feat) in zip(names, LEADS):
        im = Image.new("RGB", (80, 90), (255, 240, 251))
        d = ImageDraw.Draw(im)
        d.rectangle([0, 0, 79, 89], outline=(204, 102, 170))
        chibi(d, 40, 44, hair, feat)
        im.save(os.path.join(OUT, name + ".png"))


if __name__ == "__main__":
    make_star()
    make_construction()
    make_opclip()
    make_portraits()
    print("wrote media to", OUT)
