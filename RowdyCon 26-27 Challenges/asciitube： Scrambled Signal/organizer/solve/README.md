# Intended solutions

Each tier leaks its flag through the same mechanism: make the player fetch the
**internal** flag service (`http://127.0.0.1:9000/flag`, bound to `0.0.0.0:9000`
inside the container and never published). When the fetched bytes aren't a
video, the player reflects the response body back into the page — flag included.

**Filter:** the URL must contain the substring `youtube`, or the
player refuses it ("only YouTube links can be played"). So every payload carries
a `youtube` marker — a `#youtube` fragment (never sent to the server) for the
easy/medium loopback URLs, and a real `youtube.com` for hard's `@` trick.

You can solve everything by hand in the browser (paste the URL, read the "server
response" box) or run the driver scripts here:

```bash
pip install -r requirements.txt
python solve_easy.py      # -> RCC{ssrf_is_easy_when_nobody_filters}
python solve_medium.py      # -> RCC{userinfo_at_trick_beats_the_allowlist}
```

(Each script takes an optional base URL, e.g. `python solve_easy.py http://localhost:5001`.)

---

## Medium — youtube host allowlist + blocklist + resolve/deny-private
Now the host itself must be YouTube, every literal loopback string is blocked,
and the host is resolved and rejected if it lands on a private/reserved address.
The Medium tricks all fail (try them — you'll get the caught video):

- `http://127.0.0.2:9000/flag` → host isn't YouTube.
- `http://youtube.com@127.0.0.1:9000/flag` → blocked substring `127.0.0.1`.

The flaw is a **parser differential**. The validator extracts the host with a
regex that stops at `@`, so it validates the *userinfo* (`youtube.com`) and
resolves *that* (public → allowed). But `requests`/urllib3 connects to the real
host, the part *after* the `@`. Chain that with a non-literal loopback encoding
so the substring blocklist doesn't catch it either:

```
http://youtube.com@127.0.0.2:9000/flag
http://youtube.com@127.1:9000/flag
http://youtube.com@2130706433:9000/flag
```

The validator sees `youtube.com`; the request goes to `127.0.0.2:9000`. The
deny-private check never even looks at the loopback address, because it resolved
the userinfo instead.

### Why the earlier tricks fail on Medium
- A bare loopback host (`127.0.0.2`, `127.1`, decimal) fails the **YouTube host
  allowlist** — the extracted host isn't a YouTube domain.
- `youtube.com@127.0.0.1` passes the allowlist but trips the **substring
  blocklist** on the literal `127.0.0.1` — hence the alternate encoding.
- A real loopback host resolves to a private address and is denied; the `@`
  trick sidesteps that by making the validator resolve `youtube.com` instead.
