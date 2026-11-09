# 🧠 Steal-a-Brain-Rot

> **Tung Tung Tung Sahoor** has your attention span and won't fight you until you enter
> the ancient **Konami code** — which is sealed inside the Arena's encryption oracle.
> Break the oracle, recover the code, survive the brainrot bullet-hell, steal your brain back.

A RowdyCon 2026 CTF challenge: an Undertale-style browser game (C + raylib compiled to
WebAssembly) wrapped around an **AES-ECB byte-at-a-time decryption** challenge, served by
a Flask backend that keeps the flag server-authoritative.

- **Category:** Crypto (web-delivered)
- **Difficulty:** Medium
- **Flag format:** `RCC{...}`

## How to play

1. Open the game in a browser. Talk to Sahoor — he only spits memes and refuses to fight.
2. Head to the **Arena**. It exposes an encryption oracle:
   `GET /arena/oracle?data=<urlsafe-base64>` which returns `AES_ECB(your_bytes || SECRET)`.
3. It's ECB — identical plaintext blocks encrypt to identical ciphertext blocks. Use that
   to recover `SECRET` one byte at a time. The tail of the secret is the Konami code.
4. Enter the arrow/button sequence you recovered (it is **not** the famous
   Konami code — you have to break the oracle to learn it) to unlock the fight.
5. Win the bullet-hell fight to reveal the flag.

## Run it

```bash
docker compose up --build
# then open http://localhost:8080
```

### Configuration

| Env var | Default | Purpose |
|---|---|---|
| `FLAG` | baked `flag.txt` | The flag to award. Override per player instance (no rebuild). |
| `ARENA_HINT_MODE` | `0` | Difficulty. `1` = oracle shows per-block breakdown + an ECB hint. |
| `TOKEN_SECRET` | random per instance | Signing key for the "crypto solved" token. Usually leave unset. |

Per-player instances: `FLAG='RCC{...}' docker compose up` with a unique flag each.

## Architecture

```
Browser (raylib → wasm)  ──HTTP──►  Flask backend (server-authoritative flag)
  overworld / dialogue / fight         GET  /                → game (html + wasm + js)
  Konami input                         GET  /arena/oracle    → AES-ECB oracle (the challenge)
                                       POST /arena/unlock    → verify code, issue signed token
                                       POST /complete        → verify token, return FLAG
```

The flag never appears in any client file — it is emitted only by `/complete`, and only
after a token that requires actually recovering the Konami code from the oracle.

## Layout

```
server/      Flask app, AES-ECB oracle, token gating, built game served from static/
game/        C + raylib game sources, Emscripten build (build.sh, shell.html)
solve/       Author solver (stdlib only) — recovers the code and prints the flag. NOT for players.
Dockerfile   Multi-stage: Emscripten build → Flask runtime
BRIEF.md     Author notes, hint ladder, playtest table (not for players)
WRITEUP.md   Intended solution
```

## Author tooling

`solve/solve.py <base-url>` runs the full intended attack (ECB byte-at-a-time → unlock →
complete) and prints the flag. **Do not ship it to players.**
