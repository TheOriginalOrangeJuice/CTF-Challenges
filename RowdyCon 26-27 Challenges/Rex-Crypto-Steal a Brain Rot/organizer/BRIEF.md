# BRIEF — Steal-a-Brain-Rot (author notes, NOT for players)

| Field | Value |
|---|---|
| **Category** | Crypto (web-delivered) |
| **Difficulty** | Medium |
| **Flag** | `RCC{3cb_l34ks_wh3n_bl0cks_r3p34t_sahur}` |
| **Flag format** | `RCC{...}` (leetspeak, describes the technique) |
| **Vulnerability** | AES-128-ECB byte-at-a-time decryption oracle (cryptopals #12) |
| **Difficulty toggle** | `ARENA_HINT_MODE` (0 = intended, 1 = beginner hints) |

## Player-facing description

> **Tung Tung Tung Sahoor** has stolen everyone's attention span and he will NOT fight
> you until you prove you know "the ancient code." The code is sealed inside the Arena's
> humming oracle. Break the oracle, recover the Konami code, enter it, and survive the
> brainrot bullet-hell to steal your brain back.

## What the player actually does

1. Talk to Sahoor in the game — he only spits memes and refuses to fight.
2. Go to the Arena. It exposes an encryption oracle: `GET /arena/oracle?data=<base64>`.
   The server returns `AES_ECB( attacker_bytes || SECRET )`. Because it's **ECB**,
   identical plaintext blocks encrypt to identical ciphertext blocks.
3. Recover `SECRET` one byte at a time (classic aligned-block dictionary attack). The
   secret is `K0N4MI_C0D3=DRULBADLUR`; the tail `DRULBADLUR` is the (custom,
   non-Konami) ancient code.
4. Enter ↓→↑← B A ↓←↑→ in the game → it posts the code, gets a signed token.
5. Win the bullet-hell fight → the game redeems the token at `/complete` → flag.

## Author notes (not for players)

- The flag is **server-authoritative**: it lives only in `FLAG`/`flag.txt` and is only
  ever emitted by `/complete` after a valid token (which requires actually recovering
  the Konami code from the oracle). The fight victory is client-side flavor; the crypto
  is the real gate.
- The AES key is random per instance and never exposed. Deterministic within an instance
  so the byte-at-a-time attack is stable.
- The game is a themed wrapper. A crypto player can solve the whole thing by scripting
  the oracle and hitting `/arena/unlock` + `/complete` directly — that's intended and is
  exactly what `solve/solve.py` does.

## Difficulty toggle

`ARENA_HINT_MODE=1` makes `/arena/oracle` also return the ciphertext split into 16-byte
blocks plus a one-line hint that identical plaintext blocks map to identical ciphertext
blocks — this hands players the "it's ECB" realization and the block alignment. Default
`0` is the intended medium experience.

## Hint ladder

<details><summary>Hint 1</summary>
The Arena oracle appends a fixed secret to whatever you send, then encrypts. What mode
is it in? Try sending two identical 16-byte blocks and look at the ciphertext.
</details>

<details><summary>Hint 2</summary>
It's AES-ECB. ECB encrypts each 16-byte block independently, so equal plaintext blocks
produce equal ciphertext blocks. You can control a prefix — use that to line the unknown
secret up against a block boundary.
</details>

<details><summary>Hint 3</summary>
Byte-at-a-time: send a prefix one byte short of a block so exactly one unknown byte sits
at the end of a target block, then brute-force that byte by comparing against every
`prefix + guess`. Shift by one and repeat to peel off the whole secret. Look up
"cryptopals challenge 12."
</details>

<details><summary>Hint 4 (near-solution)</summary>
The recovered secret is `K0N4MI_C0D3=DRULBADLUR`. Enter Down Right Up Left B A Down Left
Up Right in the game, then beat the fight. `solve/solve.py` automates the entire chain.
</details>

## Playtest results

| Date | Tester | ARENA_HINT_MODE | Outcome | Notes |
|---|---|---|---|---|
| 2026-10-25 | author (browser) | 0 | pass | Full chain in Chrome: talk -> Arena -> enter code -> fight -> menu/attack/dodge all work. Solver pulls flag. |
| _TBD_ | _TBD_ | 1 | _pending_ | confirm hints land for beginners |

### Fixes applied in the polish pass (2026-10-25)
- **Web input was broken for all confirm keys.** The game loop drew before it
  updated; on emscripten that folds the key-press edge into the previous-state
  copy during `EndDrawing()`'s poll, so `IsKeyPressed` (Z/Enter) never fired on
  the web -- you could walk (IsKeyDown) but never talk, travel, or fight. Fixed
  by updating before drawing (`game/src/main.c`).
- Canvas now auto-focuses (`game/shell.html`) so keys work without clicking first.
- Overworld interaction radii widened (`game/src/overworld.c`) so standing next
  to the large sprites triggers the prompt.
- New original Sahoor sprite + Undertale-style FIGHT/ACT/ITEM/MERCY battle menu.
