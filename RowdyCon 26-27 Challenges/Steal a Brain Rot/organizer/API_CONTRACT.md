# API Contract — Steal-a-Brain-Rot (FROZEN)

All endpoints are same-origin (the Flask backend also serves the game), so **no CORS
needed**. The game client and the author solver both speak exactly this contract. Do
not change shapes without updating this file.

Base URL = origin that served the game (e.g. `http://localhost:8080`).

---

## 1. `GET /arena/oracle?data=<base64>`  — the AES-ECB oracle (the crypto challenge)

- `data`: URL-safe base64 of the attacker-controlled prefix bytes. May be empty/absent
  (treat as empty prefix).
- Server computes: `ciphertext = AES_ECB_encrypt( PKCS7_pad( attacker_bytes + SECRET ) )`
  using a fixed, per-instance random 16-byte key (never exposed).
- `SECRET` is an ASCII string ending in the ancient code (a custom, non-Konami
  arrow sequence), e.g. `K0N4MI_C0D3=DRULBADLUR`.

**Response 200 (JSON):**
```json
{ "ciphertext_hex": "ab12...", "block_size": 16 }
```
When `ARENA_HINT_MODE=1`, ALSO include:
```json
{ "ciphertext_hex": "...", "block_size": 16,
  "blocks": ["<32-hex-char block>", "..."],
  "hint": "ECB encrypts identical plaintext blocks to identical ciphertext blocks." }
```
**Response 400 (JSON):** `{ "error": "bad base64" }` for undecodable `data`.

---

## 2. `POST /arena/unlock`  — verify recovered Konami code, issue token

Request (JSON): `{ "code": "DRULBADLUR" }`
- `code` is the arrow/button sequence the player recovered (the tail of SECRET). The game
  maps each arrow/button to a letter (see mapping below); e.g. the recovered code
  `DRULBADLUR` = ↓→↑← B A ↓←↑→.

**Response 200:** `{ "ok": true, "token": "<itsdangerous-signed-token>" }`
**Response 403:** `{ "ok": false }`

---

## 3. `POST /complete`  — validate token, release flag

Request (JSON): `{ "token": "<token from /arena/unlock>" }`
- Validate signature + max_age (e.g. 2h).

**Response 200:** `{ "ok": true, "flag": "RCC{...}" }`
**Response 403:** `{ "ok": false }`

---

## Static serving
- `GET /` → the game shell `index.html`.
- `GET /game.js`, `/game.wasm`, `/game.data`, etc. → served from `server/static/`.
- The Emscripten build writes its output into `server/static/`.

## Konami mapping (shared constant)
Arrow/button → character sent in `code`:
`Up=U, Down=D, Left=L, Right=R, B=B, A=A`. Example code string: `DRULBADLUR`
(whatever the oracle's `SECRET` tail is — recovered, not guessed).
