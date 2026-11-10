# Solution — asciitube: Now Playing (Easy)

**Flag:** `RCC{ssrf_is_easy_when_nobody_filters}`

## Run this challenge on its own
This directory is fully self-contained:

```bash
cd easy
docker compose up --build        # -> http://localhost:5001
```

The player is published on 5001; the internal flag service (`0.0.0.0:9000`
inside the container) is never published — it is reachable only through the
player.

## The vulnerability: reflected SSRF
asciitube fetches the "video" URL you submit **server-side**. If the bytes it
gets back don't decode as a video, it gives up and reflects the raw response
body into the page ("couldn't decode — here's what the server received").

That fetch is a Server-Side Request Forgery sink: the server will request any URL
you give it, from its own network position — including services bound to
localhost that you can't reach directly.

On EASY there is **no host filtering**. The only check is a global anti-abuse
gate: the URL string must contain the substring `youtube`.

## Exploitation
An internal metadata/flag service listens on `127.0.0.1:9000` inside the
container and serves the flag at `/flag`. Point the player straight at it and add
a `youtube` marker to satisfy the gate:

```
http://127.0.0.1:9000/flag#youtube
```

- `#youtube` makes the string contain `youtube`, so the gate passes.
- Fragments are never sent to the server, so the real request is `GET /flag`.
- `/flag` returns `text/plain`, which doesn't decode as video, so the player
  reflects the body — the flag.

**Via the UI:** paste the URL into SOURCE, press PLAY, read the amber
"intercepted signal" panel.

**Via the solver:**
```bash
cd solver && pip install -r requirements.txt
python solve_easy.py http://localhost:5001
```

## Remediation
- Don't fetch arbitrary user-supplied URLs server-side. If you must, resolve the
  host and reject loopback/private/link-local/reserved addresses.
- Never assume a loopback-bound service is safe because it's "internal" — SSRF
  hands the attacker that network position.
- Don't reflect fetched response bodies back to the requester.
