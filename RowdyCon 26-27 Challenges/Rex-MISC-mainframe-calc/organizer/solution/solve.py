#!/usr/bin/env python3
"""
Reference solver for the RoudyCon Mainframe Calculator (web edition).

    python3 solve.py http://HOST:8080 [--delay SECONDS]

Per job:  GET the page -> pull the inline PNG and the signed token out of the HTML ->
decode the QR -> try every decoder until one yields "#<ticket>: <expression>" ->
evaluate -> POST ticket + result -> repeat with the page that comes back.
Finish at a sane pace and the mainframe unmasks your run and prints the flag on the
finish page -- there is nothing to post-process.

The mainframe refuses to print it to anyone who finishes too fast (you get the
"calc stands for calculator" video instead), so the default pace is 0.35 s per job.
--delay 0 shows that ending; a missed deadline shows the "gotta be quicker" image.

Needs: pillow, plus one QR decoder: zxing-cpp (recommended), pyzbar, or opencv-python.
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

from PIL import Image

TOKEN_RE = re.compile(r'name="token"\s+value="([^"]+)"')
IMG_RE = re.compile(r'src="data:image/png;base64,([^"]+)"')
JOB = re.compile(r"^#(\d+): ([\d\s+\-*/]+)$")
FLAG_RE = re.compile(r'id="flag">([^<]+)<')

# ------------------------------------------------------------------ HTTP

def fetch(url: str, form: dict | None = None) -> str:
    data = urllib.parse.urlencode(form).encode() if form is not None else None
    try:
        with urllib.request.urlopen(urllib.request.Request(url, data=data), timeout=15) as resp:
            return resp.read().decode()
    except urllib.error.HTTPError as e:      # the server renders failures as HTML too
        return e.read().decode()


def page_text(page: str) -> str:
    page = re.sub(r"<(style|title)>.*?</\1>", "", page, flags=re.S)
    text = html.unescape(re.sub(r"<[^>]+>", " ", page))
    links = re.findall(r'(?:href|src)="((?:https?:)?/[^"]+\.(?:jpg|png|gif)|https?://[^"]+)"', page)
    return re.sub(r"\s+", " ", text).strip() + ("\n" + "\n".join(links) if links else "")

# ------------------------------------------------------------------ QR

def decode_qr_image(img: Image.Image):
    """Try the QR libraries we know about, whichever is installed."""
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
        import numpy as np
        text, _, _ = cv2.QRCodeDetector().detectAndDecode(np.array(img.convert("RGB"))[:, :, ::-1])
        if text:
            return text
    except ImportError:
        pass
    return None

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
    """Return (decoder_name, ticket, expression) for whichever decoder yields a job."""
    for name, fn in DECODERS:
        try:
            plain = fn(payload)
        except Exception:
            continue
        m = JOB.match(plain)
        if m:
            return name, int(m.group(1)), m.group(2).strip()
    raise ValueError(f"could not decode payload: {payload!r}")

# ------------------------------------------------------------------ calculator

OPS = {ast.Add: operator.add, ast.Sub: operator.sub, ast.Mult: operator.mul, ast.Div: operator.floordiv}


def evaluate(expr: str) -> int:
    """Integer-evaluate + - * / with normal precedence, without eval()."""
    def walk(node):
        if isinstance(node, ast.BinOp):
            return OPS[type(node.op)](walk(node.left), walk(node.right))
        if isinstance(node, ast.UnaryOp) and isinstance(node.op, ast.USub):
            return -walk(node.operand)
        if isinstance(node, ast.Constant) and isinstance(node.value, int):
            return node.value
        raise ValueError(f"unexpected token in {expr!r}")
    return walk(ast.parse(expr, mode="eval").body)

# ------------------------------------------------------------------ driver

def main():
    args = sys.argv[1:]
    delay = 0.35
    if "--delay" in args:
        i = args.index("--delay")
        delay = float(args[i + 1])
        del args[i:i + 2]
    if len(args) != 1:
        sys.exit(f"usage: {sys.argv[0]} http://HOST:PORT [--delay SECONDS]")
    base = args[0].rstrip("/")

    results = []
    t0 = time.time()
    page = fetch(base + "/start")
    while True:
        tok, img = TOKEN_RE.search(page), IMG_RE.search(page)
        if not (tok and img):
            break                                   # finished, or the mainframe hung up

        payload = decode_qr_image(Image.open(io.BytesIO(base64.b64decode(img.group(1)))))
        if payload is None:
            sys.exit("could not decode the QR image")
        cipher, ticket, expr = crack(payload)
        result = evaluate(expr)
        results.append(result)
        print(f"[{len(results):>2}] {cipher:<6} #{ticket}  {expr:<18} = {result:>3}")

        if delay:
            time.sleep(delay)
        page = fetch(base + "/answer", {"token": tok.group(1), "ticket": ticket, "result": result})

    print(f"\n--- server says ({time.time() - t0:.2f}s) ---\n{page_text(page)}")
    flag = FLAG_RE.search(page)
    if flag:
        print(f"\nflag -> {html.unescape(flag.group(1)).strip()}")
    elif results:
        print(f"\nno flag on that page; cleared {len(results)} jobs but the mainframe "
              f"didn't print it (too fast, or the line hung up)")


if __name__ == "__main__":
    main()
