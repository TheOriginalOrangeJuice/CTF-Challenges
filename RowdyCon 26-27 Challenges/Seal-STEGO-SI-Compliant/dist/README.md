# SI Compliance

**Category:** Forensics  **Difficulty:** Easy to Medium  **Flag format:** `ctf{...}`

## Description (player-facing)

> On September 29, 2026, the President signed an Executive Order requiring federal
> agencies to say **"Super Intelligence" (SI)** instead of **"Artificial Intelligence" (AI)**.
>
> The Department of Federal Modernization took this *very* seriously. An intern was
> told to make every agency asset compliant before the end of the day, so they wrote a
> one-line script and ran it on the entire asset share, binaries included.
>
> Now the official Department Seal won't open. Legal says the seal held something
> important. Can you undo the damage? Nobody kept a backup.

**Files:** `dist/seal_SI_compliant.png`, `dist/find-and-replace.sh`

### Hints (optional, in increasing cost)
1. Every `SI` in the file is either an original `SI` or a former `AI`. How would you know which?
2. Every PNG chunk carries a checksum over its type and data.
3. Ignoring the checksums gets you a picture, not the flag. You need the *exact* original bytes.

## Layout

| Path | Purpose |
|------|---------|
| `dist/` | Give these to players |
#| `author/generate.py` | Builds the original PNG and the corrupted handout (`python3 generate.py [flag]`) |
#| `author/solve.py` | Reference solver (`python3 -I author/solve.py dist/seal_SI_compliant.png out.png`) |
#| `author/original_seal.png` | Uncorrupted original, for verification |
#| `author/flag.txt` | The flag |

## Flag
`rcc{SUP3R_1NT3LL1G3NC3_0V3R_ART1F1C14L_1NT3LL1G3NC3}`

## Intended solution

1. `pngcheck` or any PNG parser reports CRC errors in many chunks. The script shows that
   `s/AI/SI/g` was run over raw bytes, so `0x41 0x49` became `0x53 0x49` everywhere.
2. The replacement is lossy, but each chunk has a CRC-32. For each chunk, find the `k`
   positions holding `SI` and try all `2^k` combinations of `SI`/`AI` until the CRC
   matches. In this build `k <= 3` per chunk, and the solver finishes in well under a second.
3. The restored image (or the corrupted one decoded leniently) gives the sealing scheme:
   `flag = siFl XOR SHA256(K||0)||SHA256(K||1)||...` with `K = SHA256(concatenated IDAT data)`.
4. Hash the **restored** IDAT stream and decrypt the private `siFl` chunk to get the flag.

**Anti-shortcut:** zlib decodes the corrupted stream almost completely if the CRCs are
ignored, so a flag drawn in the pixels would leak without any repair. That is why the flag
is encrypted with a key that depends on every IDAT byte. The generator also guarantees
that no `AI`/`SI` pair touches a length, type or CRC field, at least 8 real `AI` pairs fall
inside IDAT data, and no chunk has more than 16 candidates.
