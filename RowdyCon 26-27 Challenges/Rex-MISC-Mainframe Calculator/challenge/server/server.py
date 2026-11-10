#!/usr/bin/env python3
"""
RoudyCon Mainframe Calculator -- web edition. Plain HTML forms, no JavaScript.

Every round is one page: a QR code and a form. The QR payload is a "job" wrapped in
a randomly chosen encoding/cipher that the player has to identify:

    #<ticket>: <expression>          e.g.  #482913: 17 * 4 + 14

The expression evaluates to one flag character XORed with a per-run pad byte. The
player posts "<ticket>" and "<result>" before the round deadline. Three endings:

  * every job cleared, but the whole run took less than TOO_FAST seconds:
        the "calc stands for calculator" video. No flag.
  * a job answered after its deadline:
        the "you've gotta be quicker than that" image. No flag.
  * every job cleared at a sane pace:
        the server unmasks the run and prints the flag on the finish page.

There is no server-side session. Round state (round number, queue id, start time,
deadline, and an HMAC commitment to the expected ticket+result) rides along in a
signed hidden form field, so the server is stateless and restart-safe. The pad is
derived from the queue id with the server secret, so it needs no storage either and
cannot be computed by the player. The ticket exists so that answers cannot be
brute-forced: it is random per job and only obtainable by decoding the QR and the
cipher.

Configuration is via environment variables (see CONFIG below).
"""

import base64
import hashlib
import hmac
import io
import json
import os
import random
import re
import secrets
import time

import jinja2
import qrcode
from flask import Flask, render_template, request

# ----------------------------------------------------------------------------- CONFIG
FLAG = os.environ.get("FLAG", "RCC{sc4n_d3c0d3_c4lcul4t3_r3p34t}")
PORT = int(os.environ.get("PORT", "8080"))
FIRST_TIMEOUT = float(os.environ.get("FIRST_TIMEOUT", "30"))  # seconds for job 1
ROUND_TIMEOUT = float(os.environ.get("ROUND_TIMEOUT", "5"))   # seconds for every other job
TOO_FAST = float(os.environ.get("TOO_FAST", "10"))            # whole run under this -> video, no flag
MEME_URL = os.environ.get("MEME_URL", "https://youtu.be/qy2fr9d5J3M")
SLOW_IMAGE = os.environ.get("SLOW_IMAGE", "/static/too_slow.jpg")
# Tokens and pads are keyed with this. Set it explicitly when running more than one
# replica; a single gunicorn (--preload) or python process is fine with the random default.
SECRET = (os.environ.get("SECRET") or secrets.token_hex(32)).encode()

rng = random.SystemRandom()

if not all(33 <= ord(c) <= 126 for c in FLAG):
    raise SystemExit("FLAG must be printable ASCII without spaces")

# ----------------------------------------------------------------------------- ciphers
# Each function takes the plaintext job string and returns the text that goes into
# the QR code. The player is never told which one was used.

def enc_base64(s: str) -> str:
    return base64.b64encode(s.encode()).decode()


def enc_base32(s: str) -> str:
    return base64.b32encode(s.encode()).decode()


def enc_hex(s: str) -> str:
    return s.encode().hex()


def enc_rot47(s: str) -> str:
    return "".join(chr(33 + (ord(c) - 33 + 47) % 94) if 33 <= ord(c) <= 126 else c for c in s)


def enc_xor(s: str) -> str:
    key = rng.randint(1, 255)
    return bytes(b ^ key for b in s.encode()).hex()


CIPHERS = {
    "base64": enc_base64,
    "base32": enc_base32,
    "hex": enc_hex,
    "rot47": enc_rot47,
    "xor": enc_xor,
}

# ----------------------------------------------------------------------------- jobs

def make_expression(target: int) -> str:
    """Return a random integer expression (standard precedence) equal to target (0..255)."""
    kind = rng.choice(["add", "sub", "muladd", "mulsub", "div", "addsub"])
    if kind == "muladd":
        b = rng.randint(2, 12)
        if target >= b:
            a = rng.randint(1, target // b)
            return f"{a} * {b} + {target - a * b}"
        kind = "add"
    if kind == "add":
        a = rng.randint(0, target)
        return f"{a} + {target - a}"
    if kind == "sub":
        b = rng.randint(1, 999 - target)
        return f"{target + b} - {b}"
    if kind == "mulsub":
        b = rng.randint(2, 12)
        a = target // b + rng.randint(1, 20)
        return f"{a} * {b} - {a * b - target}"
    if kind == "div":
        b = rng.randint(2, 7)
        return f"{target * b} / {b}"
    a = rng.randint(target, 999)  # addsub
    b = rng.randint(0, 999)
    return f"{a} + {b} - {a + b - target}"


def make_job(target: int, round_no: int):
    """Return (ticket, ciphertext) for one round."""
    ticket = rng.randint(100000, 999999)
    plaintext = f"#{ticket}: {make_expression(target)}"
    # Round 1 is always base64 so players can find their footing; afterwards it's a mystery.
    name = "base64" if round_no == 1 else rng.choice(list(CIPHERS))
    return ticket, CIPHERS[name](plaintext)


def qr_data_url(payload: str):
    """Return (data URL, pixel size) for a PNG QR code of the payload."""
    qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_L, box_size=8, border=2)
    qr.add_data(payload)
    qr.make(fit=True)
    buf = io.BytesIO()
    qr.make_image(fill_color="black", back_color="white").save(buf, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode(), 8 * (qr.modules_count + 4)

# ----------------------------------------------------------------------------- keyed material

def _b64e(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def _b64d(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def _mac(data: str) -> bytes:
    return hmac.new(SECRET, data.encode(), hashlib.sha256).digest()


def pad_byte(queue: str, round_no: int) -> int:
    """Per-round mask byte; only the server can compute it.

    Each job's answer is the flag character XORed with this, so the values the player
    punches in never spell the flag -- which is what gives the "too fast" gate teeth: a
    run that blasts through the queue only ever collected masked bytes. Finish at pace
    and the server unmasks and prints the flag for you (see done.html); there is nothing
    for the player to XOR."""
    return _mac(f"pad:{queue}:{round_no}")[0]


def commit(queue: str, round_no: int, ticket: int, result: int) -> str:
    """Keyed commitment to the expected reply; reveals nothing without SECRET."""
    return _mac(f"answer:{queue}:{round_no}:{ticket}:{result}").hex()


def sign(state: dict) -> str:
    body = _b64e(json.dumps(state, separators=(",", ":")).encode())
    return f"{body}.{_mac('token:' + body).hex()}"


def verify(token: str):
    body, _, mac = token.partition(".")
    if not body or not hmac.compare_digest(_mac("token:" + body).hex(), mac):
        return None
    try:
        state = json.loads(_b64d(body))
        return state if {"r", "q", "s", "d", "h"} <= state.keys() else None
    except (ValueError, UnicodeDecodeError):
        return None

# ----------------------------------------------------------------------------- pages

TEMPLATES = {
"layout.html": """<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>RoudyCon Mainframe Calculator</title>
<style>
  :root { color-scheme: dark; }
  body { margin:0; min-height:100vh; display:grid; place-items:center; background:#0b0f0c; color:#b9f2c1;
         font: 15px/1.5 ui-monospace, "Cascadia Mono", Menlo, Consolas, monospace; }
  main { width:min(38rem, calc(100vw - 2rem)); padding:1.5rem; border:1px solid #1f5a2b; background:#0e1510;
         box-shadow:0 0 0 4px #0b0f0c, 0 0 0 5px #1f5a2b; }
  h1 { font-size:1.05rem; margin:0 0 1rem; letter-spacing:.06em; text-transform:uppercase; color:#e6ffe9; }
  h1 small { color:#5fa76b; text-transform:none; letter-spacing:0; }
  p, ul { margin:.6rem 0; } em { color:#e6ffe9; font-style:normal; }
  a { color:#7ee787; } code, kbd { color:#e6ffe9; background:#122016; padding:0 .3em; }
  code.card { display:block; padding:.6rem .8rem; margin:.6rem 0; line-height:1.8; word-break:break-all; }
  .qr { display:block; margin:1rem auto; image-rendering:pixelated; border:8px solid #fff; background:#fff; }
  .meme { display:block; margin:1rem auto; max-width:100%; }
  form { display:grid; grid-template-columns:auto 1fr; gap:.6rem .8rem; align-items:center; margin-top:1rem; }
  label { color:#5fa76b; } input[type=text] { font:inherit; color:#e6ffe9; background:#0b0f0c; border:1px solid #1f5a2b; padding:.35rem .5rem; }
  button { grid-column:1 / -1; font:inherit; padding:.5rem; color:#0b0f0c; background:#7ee787; border:0; cursor:pointer; }
  .meta { color:#5fa76b; } .bad { color:#ff8a8a; } .good { color:#7ee787; }
  hr { border:0; border-top:1px dashed #1f5a2b; margin:1rem 0; }
</style></head>
<body><main>
<h1>RoudyCon Mainframe Calculator <small>· build 0.94</small></h1>
{% block body %}{% endblock %}
</main></body></html>
""",

"index.html": """{% extends "layout.html" %}{% block body %}
<p>The mainframe's display died years ago, so jobs come off the line printer as QR codes.
Somewhere along the way the night-shift operators started wrapping each job in <em>some</em>
encoding before it hit the printer. Nobody remembers which. It may not even be the same one twice.</p>
<p>Each job is a ticket number and a calculation (integer arithmetic). Punch in the ticket and the result.
Clear the whole queue at a sane pace and the operator reads your run back and prints your flag.</p>
<p><em>{{ n }} jobs.</em> You get {{ first|g }} s for the first one and {{ rest|g }} s for each of the rest.
A wrong or late answer hangs up the line. It is not a patient machine. It is not a fast one either.</p>
<hr>
<p><a href="/start">Take a job &rarr;</a></p>
{% endblock %}
""",

"job.html": """{% extends "layout.html" %}{% block body %}
<p class="meta">Queue {{ q }} · job {{ r }}/{{ n }} · {{ timeout|g }} s on the clock</p>
<img class="qr" src="{{ qr }}" alt="job {{ r }}" width="{{ px }}" height="{{ px }}">
<form method="post" action="/answer" autocomplete="off">
  <input type="hidden" name="token" value="{{ token }}">
  <label for="ticket">Ticket</label> <input type="text" id="ticket" name="ticket" inputmode="numeric" autofocus>
  <label for="result">Result</label> <input type="text" id="result" name="result" inputmode="numeric">
  <button type="submit">Punch in</button>
</form>
{% endblock %}
""",

"fail.html": """{% extends "layout.html" %}{% block body %}
<p class="bad">&#x2718; {{ reason }}</p>
{% if image %}<img class="meme" src="{{ image }}" alt="Oh, you almost had it. You've gotta be quicker than that.">{% endif %}
<p class="meta">The mainframe hangs up the line.</p>
<hr>
<p><a href="/start">Take another job &rarr;</a></p>
{% endblock %}
""",

"fast.html": """{% extends "layout.html" %}{% block body %}
<p class="good">&#x2714; {{ n }}/{{ n }} jobs verified in {{ "%.2f"|format(elapsed) }} s.</p>
<p>That's&hellip; fast. Nobody reads a line printer that fast. The operator eyes the queue, eyes you,
and puts the punch card back in the drawer.</p>
<p><a href="{{ meme }}" rel="noopener">Calc stands for calculator.</a></p>
<hr>
<p><a href="/start">Take another job &rarr;</a></p>
{% endblock %}
""",

"done.html": """{% extends "layout.html" %}{% block body %}
<p class="good">&#x2714; {{ n }}/{{ n }} jobs verified in {{ "%.2f"|format(elapsed) }} s.</p>
<p>The ribbon on that printer is worn, so every result you punched in came out masked. The
operator runs your run back through the queue's punch card, the line printer chatters, and
one last slip rolls out:</p>
<code class="card" id="flag">{{ flag }}</code>
<p class="meta">Queue {{ q }} · cleared.</p>
{% endblock %}
""",
}

app = Flask(__name__)
app.jinja_loader = jinja2.DictLoader(TEMPLATES)
app.jinja_env.filters["g"] = lambda x: f"{x:g}"   # 5.0 -> "5", 2.5 -> "2.5"


def issue_round(round_no: int, queue: str, started: float):
    target = ord(FLAG[round_no - 1]) ^ pad_byte(queue, round_no)
    ticket, ciphertext = make_job(target, round_no)
    timeout = FIRST_TIMEOUT if round_no == 1 else ROUND_TIMEOUT
    state = {"r": round_no, "q": queue, "s": started, "d": time.time() + timeout,
             "h": commit(queue, round_no, ticket, target)}
    qr, px = qr_data_url(ciphertext)
    return render_template("job.html", n=len(FLAG), r=round_no, q=queue, timeout=timeout,
                           qr=qr, px=px, token=sign(state))


@app.get("/")
def index():
    return render_template("index.html", n=len(FLAG), first=FIRST_TIMEOUT, rest=ROUND_TIMEOUT)


@app.get("/start")
def start():
    return issue_round(1, secrets.token_hex(4), time.time())


@app.post("/answer")
def answer():
    state = verify(request.form.get("token", ""))
    if state is None:
        return render_template("fail.html", reason="That ticket stub isn't from this mainframe."), 400

    now = time.time()
    if now > state["d"]:
        return render_template("fail.html", reason="Too slow.", image=SLOW_IMAGE)

    ticket = request.form.get("ticket", "").strip().lstrip("#")
    result = request.form.get("result", "").strip()
    if not (re.fullmatch(r"\d+", ticket) and re.fullmatch(r"-?\d+", result)) \
            or not hmac.compare_digest(commit(state["q"], state["r"], int(ticket), int(result)), state["h"]):
        return render_template("fail.html", reason="Wrong.")

    if state["r"] < len(FLAG):
        return issue_round(state["r"] + 1, state["q"], state["s"])

    elapsed = now - state["s"]
    if elapsed < TOO_FAST:
        return render_template("fast.html", n=len(FLAG), elapsed=elapsed, meme=MEME_URL)
    return render_template("done.html", n=len(FLAG), elapsed=elapsed, q=state["q"], flag=FLAG)


if __name__ == "__main__":
    print(f"[*] Mainframe Calculator on :{PORT}  ({len(FLAG)} jobs, ciphers={','.join(CIPHERS)}, "
          f"too fast under {TOO_FAST:g}s)", flush=True)
    app.run(host="0.0.0.0", port=PORT, threaded=True)
