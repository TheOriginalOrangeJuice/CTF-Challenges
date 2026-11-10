#!/usr/bin/env python3
"""
Reference solver for the RoudyCon Mainframe Calculator, HARD edition.

    python3 solve.py http://HOST:8081 [--delay SECONDS] [-v]

Same loop as the base solver, but each job page is first run through a repair
pipeline that turns every printer fault back into a plain QR image:

    braille <pre>      -> dot bits -> module matrix
    <table> of cells   -> colspan + colour -> module matrix
    CSS-grid tiles     -> undo rotate(), paste by grid-row/column
    GIF                -> each frame, min-composite, |frame diff|
    PNG                -> as-is, autocontrast, alpha, each RGB channel, median, de-interlace (lines or bands)

Every candidate image is handed to a QR decoder; every payload that comes out is
handed to the cipher cracker; the first one that yields "#<ticket>: <expression>"
wins. Payloads of the form "i/n|..." are collected and joined before cracking.

Needs: pillow, numpy, plus one QR decoder: zxing-cpp (recommended), pyzbar, or opencv-python.
"""

import ast
import base64
import html
import io
import operator
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

import numpy as np
from PIL import Image, ImageFilter, ImageOps, ImageSequence

TOKEN_RE = re.compile(r'name="token"\s+value="([^"]+)"')
JOB = re.compile(r"^#(\d+): ([\d\s+\-*/]+)$")
PART = re.compile(r"^(\d+)/(\d+)\|(.*)$", re.S)
FLAG_RE = re.compile(r'id="flag">([^<]+)<')
VERBOSE = False

# ------------------------------------------------------------------ HTTP

def fetch(url: str, form: dict | None = None) -> str:
    data = urllib.parse.urlencode(form).encode() if form is not None else None
    try:
        with urllib.request.urlopen(urllib.request.Request(url, data=data), timeout=15) as resp:
            return resp.read().decode()
    except urllib.error.HTTPError as e:
        return e.read().decode()


def page_text(page: str) -> str:
    page = re.sub(r"<(style|title)>.*?</\1>", "", page, flags=re.S)
    text = html.unescape(re.sub(r"<[^>]+>", " ", page))
    links = re.findall(r'(?:href|src)="((?:https?:)?/[^"]+\.(?:jpg|png|gif)|https?://[^"]+)"', page)
    return re.sub(r"\s+", " ", text).strip() + ("\n" + "\n".join(links) if links else "")

# ------------------------------------------------------------------ QR decoding

def decode_qr_image(img: Image.Image):
    try:
        import zxingcpp
        r = zxingcpp.read_barcode(img)
        if r is not None and r.valid:
            return r.text
    except ImportError:
        pass
    try:
        from pyzbar.pyzbar import decode
        r = decode(img)
        if r:
            return r[0].data.decode()
    except ImportError:
        pass
    try:
        import cv2
        text, _, _ = cv2.QRCodeDetector().detectAndDecode(np.array(img.convert("RGB"))[:, :, ::-1])
        if text:
            return text
    except ImportError:
        pass
    return None


def matrix_image(m: np.ndarray, box: int = 8) -> Image.Image:
    """Module matrix (True = dark) -> black-on-white image with a quiet zone."""
    m = np.pad(m, 2)
    return Image.fromarray(np.where(np.kron(m, np.ones((box, box), dtype=bool)), 0, 255).astype(np.uint8))

# ------------------------------------------------------------------ repairs

BRAILLE_DOTS = [(0, 0, 0x01), (1, 0, 0x02), (2, 0, 0x04), (0, 1, 0x08),
                (1, 1, 0x10), (2, 1, 0x20), (3, 0, 0x40), (3, 1, 0x80)]


def braille_matrix(text: str) -> np.ndarray:
    lines = text.split("\n")
    m = np.zeros((4 * len(lines), 2 * max(map(len, lines))), dtype=bool)
    for y, line in enumerate(lines):
        for x, ch in enumerate(line):
            bits = ord(ch) - 0x2800
            for dy, dx, bit in BRAILLE_DOTS:
                if bits & bit:
                    m[4 * y + dy, 2 * x + dx] = True
    return m


def table_matrix(inner: str) -> np.ndarray:
    rows = []
    for tr in re.findall(r"<tr[^>]*>(.*?)</tr>", inner, re.S):
        row = []
        for span, hexcol in re.findall(r'<td colspan="(\d+)"[^>]*background:#([0-9a-fA-F]{6})', tr):
            r, g, b = (int(hexcol[i:i + 2], 16) for i in (0, 2, 4))
            row += [0.299 * r + 0.587 * g + 0.114 * b < 128] * int(span)
        rows.append(row)
    return np.array(rows, dtype=bool)


def tiles_image(inner: str) -> Image.Image:
    tiles = []
    for tag in re.findall(r"<img[^>]*>", inner):
        r = int(re.search(r"grid-row:(\d+)", tag).group(1))
        c = int(re.search(r"grid-column:(\d+)", tag).group(1))
        angle = int(re.search(r"rotate\((-?\d+)deg\)", tag).group(1))
        raw = base64.b64decode(re.search(r'src="data:image/png;base64,([^"]+)"', tag).group(1))
        # CSS rotate() is clockwise; PIL's is counter-clockwise, so -angle undoes the display rotation.
        tiles.append((r, c, Image.open(io.BytesIO(raw)).convert("L").rotate(-angle, expand=True)))
    t = tiles[0][2].size[0]
    canvas = Image.new("L", (t * max(c for _, c, _ in tiles), t * max(r for r, _, _ in tiles)), 255)
    for r, c, tile in tiles:
        canvas.paste(tile, ((c - 1) * t, (r - 1) * t))
    return canvas


def gif_candidates(im: Image.Image):
    frames = [np.asarray(f.convert("L")) for f in ImageSequence.Iterator(im)]
    for i, f in enumerate(frames):
        yield f"gif frame {i}", Image.fromarray(f)
    if len(frames) > 1:
        yield "gif min-composite", Image.fromarray(np.min(np.stack(frames), axis=0))
        for i in range(len(frames) - 1):
            d = np.abs(frames[i].astype(int) - frames[i + 1].astype(int))
            yield f"gif diff {i}", Image.fromarray(np.where(d > 64, 0, 255).astype(np.uint8))


def png_candidates(im: Image.Image):
    L = im.convert("L")
    yield "as-is", L
    yield "autocontrast", ImageOps.autocontrast(L)
    if im.mode == "RGBA":
        yield "alpha channel", ImageOps.autocontrast(im.split()[3])
    if im.mode in ("RGB", "RGBA"):
        for name, ch in zip("RGB", im.convert("RGB").split()):
            yield f"channel {name}", ImageOps.autocontrast(ch)
    yield "median 7", L.filter(ImageFilter.MedianFilter(7))
    a = np.asarray(L)
    for phase in (0, 1):                                   # classic line interlace
        yield f"rows {phase}::2", Image.fromarray(np.repeat(a[phase::2], 2, axis=0))
    for off in range(8):                                   # 4-px band interlace at any offset
        keep = ((np.arange(a.shape[0]) + off) % 8) < 4
        yield f"bands +{off}", Image.fromarray(np.repeat(a[keep], 2, axis=0))


def candidates(page: str):
    """Yield (label, image) repair candidates for one job page, cheapest first."""
    m = re.search(r'<pre class="braille">(.*?)</pre>', page, re.S)
    if m:
        yield "braille", matrix_image(braille_matrix(html.unescape(m.group(1))))
    m = re.search(r'<table class="qrt"[^>]*>(.*?)</table>', page, re.S)
    if m:
        yield "table", matrix_image(table_matrix(m.group(1)))
    m = re.search(r'<div class="tiles"[^>]*>(.*?)</div>', page, re.S)
    if m:
        yield "tiles", tiles_image(m.group(1))
        page = page[:m.start()] + page[m.end():]
    for n, (mime, b64) in enumerate(re.findall(r'src="data:image/(png|gif);base64,([^"]+)"', page)):
        im = Image.open(io.BytesIO(base64.b64decode(b64)))
        for label, cand in (gif_candidates(im) if mime == "gif" else png_candidates(im)):
            yield f"img{n} {label}", cand

# ------------------------------------------------------------------ the "mystery" layer

def dec_base64(s): return base64.b64decode(s, validate=True).decode()
def dec_base32(s): return base64.b32decode(s).decode()
def dec_hex(s):    return bytes.fromhex(s).decode()
def dec_rot47(s):  return "".join(chr(33 + (ord(c) - 33 + 47) % 94) if 33 <= ord(c) <= 126 else c for c in s)


def dec_xor(s):
    raw = bytes.fromhex(s)
    for key in range(1, 256):
        try:
            candidate = bytes(b ^ key for b in raw).decode("ascii")
        except UnicodeDecodeError:
            continue
        if JOB.match(candidate):
            return candidate
    raise ValueError("no single-byte XOR key produced a job")


DECODERS = [("base64", dec_base64), ("base32", dec_base32), ("hex", dec_hex),
            ("rot47", dec_rot47), ("xor", dec_xor)]


def crack(payload: str):
    for name, fn in DECODERS:
        try:
            plain = fn(payload)
        except Exception:
            continue
        m = JOB.match(plain)
        if m:
            return name, int(m.group(1)), m.group(2).strip()
    return None

# ------------------------------------------------------------------ calculator

OPS = {ast.Add: operator.add, ast.Sub: operator.sub, ast.Mult: operator.mul, ast.Div: operator.floordiv}


def evaluate(expr: str) -> int:
    def walk(node):
        if isinstance(node, ast.BinOp):
            return OPS[type(node.op)](walk(node.left), walk(node.right))
        if isinstance(node, ast.UnaryOp) and isinstance(node.op, ast.USub):
            return -walk(node.operand)
        if isinstance(node, ast.Constant) and isinstance(node.value, int):
            return node.value
        raise ValueError(f"unexpected token in {expr!r}")
    return walk(ast.parse(expr, mode="eval").body)

# ------------------------------------------------------------------ one job page

def solve_page(page: str):
    """Return (repair label, cipher, ticket, expression) or None."""
    parts = {}
    for label, img in candidates(page):
        payload = decode_qr_image(img)
        if VERBOSE:
            print(f"      {label:<22} -> {payload!r:.60}")
        if payload is None:
            continue
        m = PART.match(payload)
        if m:
            parts[int(m.group(1))] = (int(m.group(2)), m.group(3))
            total = int(m.group(2))
            if len(parts) == total:
                joined = "".join(parts[i][1] for i in range(1, total + 1))
                hit = crack(joined)
                if hit:
                    return (f"{label} (+{total} parts)",) + hit
            continue
        hit = crack(payload)
        if hit:
            return (label,) + hit
    return None

# ------------------------------------------------------------------ driver

def main():
    global VERBOSE
    args = sys.argv[1:]
    if "-v" in args:
        VERBOSE = True
        args.remove("-v")
    delay = 0.35
    if "--delay" in args:
        i = args.index("--delay")
        delay = float(args[i + 1])
        del args[i:i + 2]
    if len(args) != 1:
        sys.exit(f"usage: {sys.argv[0]} http://HOST:PORT [--delay SECONDS] [-v]")
    base = args[0].rstrip("/")

    results = []
    t0 = time.time()
    page = fetch(base + "/start")
    while TOKEN_RE.search(page):
        token = TOKEN_RE.search(page).group(1)
        fault = re.search(r"fault: ([\w ]+)<", page)
        t1 = time.time()
        hit = solve_page(page)
        if hit is None:
            sys.exit(f"could not repair job {len(results) + 1} (fault: {fault.group(1) if fault else '?'})")
        label, cipher, ticket, expr = hit
        result = evaluate(expr)
        results.append(result)
        print(f"[{len(results):>2}] {fault.group(1) if fault else '?':<12} via {label:<24} {cipher:<6} "
              f"#{ticket} {expr:<18} = {result:>3}  ({time.time() - t1:.2f}s)")
        if delay:
            time.sleep(delay)
        page = fetch(base + "/answer", {"token": token, "ticket": ticket, "result": result})

    print(f"\n--- server says ({time.time() - t0:.2f}s) ---\n{page_text(page)}")
    flag = FLAG_RE.search(page)
    if flag:
        print(f"\nflag -> {html.unescape(flag.group(1)).strip()}")
    elif results:
        print(f"\nno flag on that page; cleared {len(results)} jobs but the mainframe "
              f"didn't print it (too fast, or the line hung up)")


if __name__ == "__main__":
    main()
