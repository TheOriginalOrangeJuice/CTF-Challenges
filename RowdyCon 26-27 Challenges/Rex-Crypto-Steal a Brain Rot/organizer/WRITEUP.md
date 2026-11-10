# Steal-a-Brain-Rot — Intended Solution Writeup

**Category:** Crypto (web-delivered)
**Flag:** `RCC{...}` (released by the server via `/complete`)

## The story

You're in an Undertale-style boss fight against a meme boss. To unlock the
fight you must enter a Konami code — but the code is hidden inside a server-side
secret. The game exposes an encryption "arena" (`/arena/oracle`) that is, in
fact, a textbook **AES-ECB encryption oracle**. This is cryptopals challenge 12:
*byte-at-a-time ECB decryption (simple)*.

## The oracle

`GET /arena/oracle?data=<url-safe base64>` returns

```
ciphertext = AES-128-ECB( PKCS7_pad( attacker_bytes + SECRET ) )
```

where:

- `attacker_bytes` is fully controlled by you (the decoded `data`),
- `SECRET` is a fixed ASCII string ending in the Konami code,
- the 16-byte AES key is random **but fixed for the instance's lifetime** and
  never exposed.

Two properties make this breakable:

1. **ECB is deterministic and stateless per block.** The same 16-byte plaintext
   block always encrypts to the same 16-byte ciphertext block under the same
   key. There is no IV and no chaining between blocks.
2. **You control the prefix length**, so you can slide `SECRET` through block
   boundaries one byte at a time.

## Step 1 — Find the block size

Encrypt progressively longer all-`A` prefixes and watch the ciphertext length.
It stays constant, then jumps by exactly one block when your prefix crosses a
PKCS#7 padding boundary. That jump is the block size: **16 bytes** → AES.

## Step 2 — Confirm it's ECB

Send four identical blocks (`"A" * 64`). Because ECB maps identical plaintext
blocks to identical ciphertext blocks, you'll see repeated 16-byte ciphertext
blocks. A chaining mode such as CBC would not repeat. (Setting
`ARENA_HINT_MODE=1` makes the server hand you the per-block hex breakdown and a
banner spelling this out — the easier difficulty.)

## Step 3 — Recover SECRET, one byte at a time

The attack recovers each unknown byte by forcing it into a known, aligned
position:

1. Pick a filler of length `block_size - 1 - (i % block_size)` for the `i`-th
   target byte. This pushes the first unknown byte into the **last position of a
   block** whose other 15 bytes you already know.
2. Encrypt just the filler and record the ciphertext block that now ends in the
   unknown byte — call it the *target block*.
3. Build a dictionary: for every possible byte `b` in `0..255`, encrypt
   `filler + recovered_so_far + b` and record the same block position. One of
   those 256 encryptions matches the target block — that `b` is the next secret
   byte.
4. Append `b` to the recovered bytes and repeat for the next position, shifting
   into the next block as needed.

Because each query collapses one unknown byte to at most 256 oracle calls, the
whole secret falls out quickly and deterministically.

The recovered `SECRET` is `K0N4MI_C0D3=DRULBADLUR`. The code tail is everything
after the `=`: **`DRULBADLUR`** (↓→↑← B A ↓←↑→). Note this is deliberately NOT
the real Konami code — players must break the oracle, not guess.

## Step 4 — Unlock and claim the flag

The flag release is **server-authoritative** — the client never holds it:

1. `POST /arena/unlock` with `{"code": "DRULBADLUR"}`. The server does a
   constant-time compare against the code tail and, on success, returns a
   short-lived `itsdangerous`-signed token.
2. `POST /complete` with `{"token": "..."}`. The server verifies the signature
   and age (max 2h) and only then returns `{"ok": true, "flag": "RCC{...}"}`.

A token can't be forged without the server's signing secret, and the flag never
appears in any static asset or in any response other than a valid `/complete`.

## Reference solver

`solve/solve.py` implements all four steps using only the Python standard
library (it never performs AES locally — it extracts everything through the
oracle). Run it against a live instance:

```bash
python3 solve/solve.py http://localhost:8080
```

It prints the recovered secret, the Konami code, and finally the flag.
