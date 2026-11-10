"""Flask backend for the Steal-a-Brain-Rot RowdyCon 2026 CTF challenge.

Responsibilities:
  * serve the browser game (static files written into server/static by the build)
  * expose the AES-ECB oracle (the crypto puzzle) at GET /arena/oracle
  * verify the recovered Konami code and issue a signed token at POST /arena/unlock
  * validate the token and release the flag at POST /complete (server-authoritative)

The flag is read from env FLAG, defaulting to flag.txt at the repo root. It is
NEVER embedded in any static/client file and only ever appears in a successful
/complete response.
"""

import base64
import binascii
import hmac
import os

from flask import Flask, jsonify, request, send_from_directory

import crypto
import tokens

# --- paths -----------------------------------------------------------------

_HERE = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(_HERE, "static")
_REPO_ROOT = os.path.dirname(_HERE)

# --- difficulty toggle -----------------------------------------------------

# ARENA_HINT_MODE=1 adds the per-block hex breakdown + hint banner to the oracle
# response, making the "it's ECB" realization easier. Default "0" = medium.
HINT_MODE = os.environ.get("ARENA_HINT_MODE", "0") == "1"

_HINT_TEXT = (
    "ECB encrypts identical plaintext blocks to identical ciphertext blocks."
)

# --- flag loading ----------------------------------------------------------


def _load_flag() -> str:
    """Load the flag from env FLAG, else from flag.txt at the repo root.

    The flag is resolved server-side only and never written into client assets.
    """
    env_flag = os.environ.get("FLAG")
    if env_flag:
        return env_flag.strip()
    flag_path = os.path.join(_REPO_ROOT, "flag.txt")
    try:
        with open(flag_path, "r", encoding="utf-8") as fh:
            return fh.read().strip()
    except OSError:
        # Fail closed: no flag available means /complete cannot leak anything.
        return ""


FLAG = _load_flag()

app = Flask(__name__, static_folder=None)

# Placeholder shown until the game build populates server/static/index.html.
_PLACEHOLDER_HTML = """<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Steal-a-Brain-Rot</title></head>
<body style="font-family:system-ui,sans-serif;background:#111;color:#eee;padding:2rem">
<h1>Steal-a-Brain-Rot</h1>
<p>The game build hasn't been run yet, so there's no <code>index.html</code> in
<code>server/static/</code>.</p>
<p>The backend API is live: <code>/arena/oracle</code>, <code>/arena/unlock</code>,
<code>/complete</code>.</p>
</body>
</html>"""


# --- static serving --------------------------------------------------------


@app.route("/")
def index():
    """Serve the game shell, or a placeholder if the build hasn't run."""
    index_path = os.path.join(STATIC_DIR, "index.html")
    if os.path.isfile(index_path):
        return send_from_directory(STATIC_DIR, "index.html")
    return _PLACEHOLDER_HTML, 200, {"Content-Type": "text/html; charset=utf-8"}


@app.route("/<path:filename>")
def static_files(filename):
    """Serve game assets (game.js / game.wasm / game.data / ...) from static/.

    send_from_directory guards against path traversal. Missing files 404.
    """
    safe_path = os.path.join(STATIC_DIR, filename)
    if os.path.isfile(safe_path):
        return send_from_directory(STATIC_DIR, filename)
    return jsonify({"error": "not found"}), 404


# --- API: the AES-ECB oracle ----------------------------------------------


@app.route("/arena/oracle", methods=["GET"])
def arena_oracle():
    """AES-ECB oracle: encrypt(PKCS7_pad(attacker_bytes + SECRET)).

    `data` is URL-safe base64 of the attacker prefix; empty/absent = empty prefix.
    """
    data_param = request.args.get("data", "")
    if data_param == "":
        attacker_bytes = b""
    else:
        try:
            # URL-safe base64; tolerate missing padding by re-padding to %4 == 0.
            padded = data_param + "=" * (-len(data_param) % 4)
            attacker_bytes = base64.urlsafe_b64decode(padded)
        except (binascii.Error, ValueError):
            return jsonify({"error": "bad base64"}), 400

    ciphertext = crypto.encryption_oracle(attacker_bytes)

    resp = {
        "ciphertext_hex": ciphertext.hex(),
        "block_size": crypto.BLOCK_SIZE,
    }
    if HINT_MODE:
        resp["blocks"] = [b.hex() for b in crypto.split_blocks(ciphertext)]
        resp["hint"] = _HINT_TEXT
    return jsonify(resp)


# --- API: unlock (verify Konami code, issue token) -------------------------


@app.route("/arena/unlock", methods=["POST"])
def arena_unlock():
    """Verify the recovered Konami code; issue a signed token on success."""
    payload = request.get_json(silent=True) or {}
    code = payload.get("code")
    if not isinstance(code, str):
        return jsonify({"ok": False}), 403

    # Constant-time compare against the canonical Konami code.
    if hmac.compare_digest(code, crypto.KONAMI_CODE):
        return jsonify({"ok": True, "token": tokens.issue_token()}), 200
    return jsonify({"ok": False}), 403


# --- API: complete (validate token, release flag) --------------------------


@app.route("/complete", methods=["POST"])
def complete():
    """Validate the signed token and release the flag (server-authoritative)."""
    payload = request.get_json(silent=True) or {}
    token = payload.get("token")
    if isinstance(token, str) and tokens.verify_token(token) and FLAG:
        return jsonify({"ok": True, "flag": FLAG}), 200
    return jsonify({"ok": False}), 403


# --- dev runner ------------------------------------------------------------

if __name__ == "__main__":
    # Dev convenience only; production uses gunicorn (see requirements.txt).
    app.run(host="0.0.0.0", port=8080)
