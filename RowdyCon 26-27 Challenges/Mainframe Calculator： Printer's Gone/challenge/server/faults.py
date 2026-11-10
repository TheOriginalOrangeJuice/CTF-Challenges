"""
Printer faults for the hard Mainframe Calculator.

Every fault takes the QR payload (the already-enciphered job) and returns an HTML
fragment. A browser renders each one as something a human recognises as a QR code,
but a script has to actively repair it before a QR decoder will read it. Everything
is inline (data: URLs, <table>, <pre>): no JavaScript, no external requests.

    wavy_gif      animated GIF, every frame warped except one      -> pick the clean frame
    blinds_gif    animated GIF, each frame shows a few rows        -> merge all frames (min)
    diff_gif      two frames of noise                              -> the QR is their difference
    isolum        red on green with identical luminance            -> read one colour channel
    alpha         a decoy QR in RGB, the real one in the alpha     -> read the alpha channel
    lowcontrast   two greys one or two levels apart                -> stretch the contrast
    noise         a third of the pixels are salt and pepper        -> median filter
    interlace     real QR in 4-px bands, a decoy in between       -> keep the right bands, stretch
    tiles         16 tiles, shuffled in the DOM, placed by CSS     -> reassemble from the CSS
    table         an HTML table of coloured, run-length cells      -> parse colspan + colour
    braille       Unicode braille, 2x4 modules per character       -> decode the dot bits
    split         the payload spread over two or three QR codes   -> decode all, join by index
"""

import base64
import io
import random
import secrets

import numpy as np
import qrcode
from PIL import Image

rng = random.SystemRandom()
nprng = np.random.default_rng()
BOX = 8  # pixels per module

# ----------------------------------------------------------------------------- helpers

def matrix(payload: str) -> np.ndarray:
    """Boolean module matrix (True = dark) including a 2-module quiet zone."""
    qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_L, border=2)
    qr.add_data(payload)
    qr.make(fit=True)
    return np.array(qr.get_matrix(), dtype=bool)


def gray(payload: str, box: int = BOX) -> np.ndarray:
    """uint8 raster, 0 = dark module, 255 = light."""
    return np.where(np.kron(matrix(payload), np.ones((box, box), dtype=bool)), 0, 255).astype(np.uint8)


def decoy(shape) -> np.ndarray:
    """A real, scannable QR code whose payload is junk, resized to `shape`."""
    g = gray("decoy:" + secrets.token_hex(6))
    return np.asarray(Image.fromarray(g).resize((shape[1], shape[0]), Image.NEAREST))


def data_url(img: Image.Image, fmt: str, **kw) -> str:
    buf = io.BytesIO()
    img.save(buf, format=fmt, **kw)
    return f"data:image/{fmt.lower()};base64," + base64.b64encode(buf.getvalue()).decode()


def img_tag(img: Image.Image, fmt: str = "PNG", **kw) -> str:
    w, h = img.size
    return f'<img class="qr" src="{data_url(img, fmt, **kw)}" alt="job" width="{w}" height="{h}">'


def gif_tag(frames, duration: int) -> str:
    w, h = frames[0].size
    buf = io.BytesIO()
    frames[0].save(buf, format="GIF", save_all=True, append_images=frames[1:], duration=duration, loop=0)
    url = "data:image/gif;base64," + base64.b64encode(buf.getvalue()).decode()
    return f'<img class="qr" src="{url}" alt="job" width="{w}" height="{h}">'

# ----------------------------------------------------------------------------- faults

def plain(payload: str) -> str:
    return img_tag(Image.fromarray(gray(payload)))


def wavy_gif(payload: str) -> str:
    """The paper feed slips: every frame is warped by a different sine wave, except one."""
    g = gray(payload)
    h, w = g.shape
    n = rng.randint(16, 24)
    clean = rng.randrange(n)
    frames = []
    for f in range(n):
        if f == clean:
            frames.append(Image.fromarray(g))
            continue
        amp = rng.uniform(5, 9)
        period = rng.uniform(30, 70)
        phase = rng.uniform(0, 2 * np.pi)
        out = g.copy()
        for y, s in enumerate(np.round(amp * np.sin(2 * np.pi * np.arange(h) / period + phase)).astype(int)):
            out[y] = np.roll(out[y], s)
        for x, s in enumerate(np.round(0.6 * amp * np.sin(2 * np.pi * np.arange(w) / period + 1.7 * phase)).astype(int)):
            out[:, x] = np.roll(out[:, x], s)
        frames.append(Image.fromarray(out))
    return gif_tag(frames, duration=70)


def blinds_gif(payload: str) -> str:
    """The print head strobes: each frame carries only some of the rows."""
    g = gray(payload)
    h, _ = g.shape
    n = rng.randint(6, 9)
    stripe = rng.choice([3, 4, 5])
    band = (np.arange(h) // stripe) % n
    frames = []
    for k in range(n):
        f = np.full_like(g, 255)
        f[band == k] = g[band == k]
        frames.append(Image.fromarray(f))
    rng.shuffle(frames)
    return gif_tag(frames, duration=60)


def diff_gif(payload: str) -> str:
    """Two frames of static. The job is the difference between them."""
    g = gray(payload, box=6)
    a = nprng.integers(0, 256, g.shape, dtype=np.uint8)
    b = a.copy()
    dark = g == 0
    b[dark] = ((a[dark].astype(int) + 128) % 256).astype(np.uint8)
    frames = [Image.fromarray(a), Image.fromarray(b)]
    rng.shuffle(frames)
    return gif_tag(frames, duration=150)


def isolum(payload: str) -> str:
    """Red on green, chosen so both have the same luminance. Greyscale sees a flat field."""
    g = gray(payload)
    r = rng.randint(190, 255)
    fg = np.array([r, 0, rng.randint(0, 60)])
    bg = np.array([0, round(r * 299 / 587), fg[2]])
    img = np.where((g == 0)[..., None], fg, bg).astype(int)
    img += nprng.integers(-3, 4, img.shape)
    return img_tag(Image.fromarray(np.clip(img, 0, 255).astype(np.uint8), "RGB"))


def alpha(payload: str) -> str:
    """A decoy QR in the colour channels; the real one hides in the alpha channel."""
    g = gray(payload)
    rgb = np.repeat(decoy(g.shape)[..., None], 3, axis=2)
    a = np.where(g == 0, 255, 250).astype(np.uint8)
    return img_tag(Image.fromarray(np.dstack([rgb, a]), "RGBA"))


def lowcontrast(payload: str) -> str:
    """The ribbon is nearly dry: two greys, one or two levels apart."""
    g = gray(payload)
    base = rng.randint(90, 170)
    d = rng.choice([1, 2])
    return img_tag(Image.fromarray(np.where(g == 0, base - d, base + d).astype(np.uint8)))


def noise(payload: str) -> str:
    """A third of the pixels are random black or white."""
    g = gray(payload)
    mask = nprng.random(g.shape) < rng.uniform(0.30, 0.38)
    salt = (nprng.integers(0, 2, g.shape) * 255).astype(np.uint8)
    return img_tag(Image.fromarray(np.where(mask, salt, g)))


def interlace(payload: str) -> str:
    """Two jobs printed on the same sheet in alternating 4-pixel bands. The other one is junk.

    The bands are offset so that the centre of every module row lands in the junk job,
    which is exactly where a decoder samples. Keeping the right bands and stretching
    them back to square gives the real job."""
    g = gray(payload)
    out = decoy(g.shape).copy()
    real = ((np.arange(g.shape[0]) + rng.choice([1, 2])) % BOX) < BOX // 2
    out[real] = g[real]
    return img_tag(Image.fromarray(out))


def tiles(payload: str) -> str:
    """Cut into 4x4 tiles, each rotated, shuffled in the DOM, put back by CSS grid."""
    n = 4
    img = Image.fromarray(gray(payload))
    side = -(-img.size[0] // n) * n
    canvas = Image.new("L", (side, side), 255)
    canvas.paste(img, (0, 0))
    t = side // n
    cells = []
    for r in range(n):
        for c in range(n):
            tile = canvas.crop((c * t, r * t, (c + 1) * t, (r + 1) * t))
            angle = rng.choice([0, 90, 180, 270])
            shown = tile.rotate(angle, expand=True)          # CSS rotate(angle) turns it back
            cells.append(f'<img style="grid-row:{r + 1};grid-column:{c + 1};transform:rotate({angle}deg)" '
                         f'src="{data_url(shown, "PNG")}" alt="" width="{t}" height="{t}">')
    rng.shuffle(cells)
    return (f'<div class="tiles" style="grid-template-columns:repeat({n},{t}px);grid-template-rows:repeat({n},{t}px)">'
            + "".join(cells) + "</div>")


def table(payload: str) -> str:
    """No image at all: a table of coloured cells, run-length encoded with colspan."""
    m = matrix(payload)
    cell = 7
    rows = []
    for row in m:
        tds, i = [], 0
        while i < len(row):
            j = i
            while j < len(row) and row[j] == row[i]:
                j += 1
            lo, hi = (0, 45) if row[i] else (210, 255)
            color = "#%02x%02x%02x" % tuple(rng.randint(lo, hi) for _ in range(3))
            tds.append(f'<td colspan="{j - i}" style="width:{(j - i) * cell}px;background:{color}"></td>')
            i = j
        rows.append(f'<tr style="height:{cell}px">{"".join(tds)}</tr>')
    return f'<table class="qrt" style="width:{m.shape[1] * cell}px">{"".join(rows)}</table>'


BRAILLE_DOTS = [(0, 0, 0x01), (1, 0, 0x02), (2, 0, 0x04), (0, 1, 0x08),
                (1, 1, 0x10), (2, 1, 0x20), (3, 0, 0x40), (3, 1, 0x80)]


def braille(payload: str) -> str:
    """The operators print jobs on the braille embosser: 2x4 modules per character."""
    m = matrix(payload)
    m = np.pad(m, ((0, -m.shape[0] % 4), (0, -m.shape[1] % 2)))
    lines = []
    for y in range(0, m.shape[0], 4):
        line = ""
        for x in range(0, m.shape[1], 2):
            bits = sum(bit for dy, dx, bit in BRAILLE_DOTS if m[y + dy, x + dx])
            line += chr(0x2800 + bits)
        lines.append(line)
    return '<pre class="braille">' + "\n".join(lines) + "</pre>"


def split(payload: str) -> str:
    """The job did not fit on one label. Parts are numbered; order on the page is random."""
    n = rng.choice([2, 3])
    k = -(-len(payload) // n)
    parts = [f"{i + 1}/{n}|{payload[i * k:(i + 1) * k]}" for i in range(n)]
    tags = [img_tag(Image.fromarray(gray(p))) for p in parts]
    rng.shuffle(tags)
    return "".join(tags)


FAULTS = {
    "wavy_gif": wavy_gif,
    "blinds_gif": blinds_gif,
    "diff_gif": diff_gif,
    "isolum": isolum,
    "alpha": alpha,
    "lowcontrast": lowcontrast,
    "noise": noise,
    "interlace": interlace,
    "tiles": tiles,
    "table": table,
    "braille": braille,
    "split": split,
}
