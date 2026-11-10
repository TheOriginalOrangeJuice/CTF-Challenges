# Final_Final_REAL

**Category:** Forensics  **Difficulty:** Medium  **Flag format:** `rcc{...}`

## Description (player-facing)

> July 12, 2013. xX_Qu1ckSc0p3r_Xx was *this close* to finishing the sickest Solarium
> frag montage of all time. The ENDCARD had all six overlays lined up perfectly for the
> final pass. Then Montage Studio 12 crashed mid-save.
>
> All that came back is the recovery file and the media folder. He swears the endcard
> "had the flag on it" and that he "lined it up pixel perfect, then messed with it a
> bunch, then hit Ctrl+Z until it looked right again."
>
> Rebuild the final pass.

Use `art/montage_studio_12.png` (the editor screenshot) as the challenge image.

**Files:** `dist/Final_Final_REAL.zip`

## Layout

| Path | Purpose |
|------|---------|
| `dist/Final_Final_REAL.zip` | Handout (recovery JSON + `media/`) |
| `dist/Final_Final_REAL/` | Unzipped copy of the handout |
| `author/generate.py` | Builds everything: `python3 author/generate.py [flag]` (Pillow + ffmpeg w/ libvpx-vp9) |
| `author/solve.py` | Reference solver: `python3 -I author/solve.py dist/Final_Final_REAL out.png` |
| `author/expected_endcard.png` | What a correct composite looks like |
| `author/flag.txt` | The flag |
| `challenge.yml` | ctfcli spec |

## Flag
`rcc{N0SC0P3D_BY_TH3_UND0_ST4CK}`

## Intended solution

1. **Find the data.** Every overlay PNG has random-looking noise in bit 0 of R, G and B
   (identical across channels, and also under fully transparent pixels). On its own,
   each one is uniform noise.
2. **Find the rule.** In the recovery JSON the six `/ endcard` events use
   `"blend": "difference"`, and `render_order` gives the pipeline:
   `pan_crop -> flip_h -> place at transform.x/y -> blend`. Difference at 1 bit is XOR.
   (Optional confirmation: frame 121 of the webm, at 00:00:04.033 where the screenshot's
   playhead sits, flashes `ENDCARD BLEND = DIFFERENCE / DEPTH = 1 BIT (LSB)`.)
3. **Recover the real parameters.** `saved_state` is stale: all six endcard crops are
   wrong there. Replay `journal` over it with real linear undo/redo:
   - `edit.apply` = one undo unit (all of its `changes`), and it **clears redo**
   - `edit.undo` reverts the top unit and pushes it to redo
   - `edit.redo` re-applies the top redo unit; a no-op if redo is empty
   - `ui.select`, `transport.*`, `preview.snapshot`, `file.save` are not undoable
   (Optional hint: the L−R channel of the wav has
   `A NEW EDIT KILLS THE REDO STACK` in its spectrogram.)
4. **Composite.** For each endcard event take the LSB plane of its PNG, crop it, mirror it
   if `flip_h`, place it at `(transform.x, transform.y)` on a 1152×648 canvas, XOR.
   The flag is on the canvas.

## Why the shortcuts fail

The generator asserts that each of these produces a wrong composite (static, no flag):

| Wrong approach | Endcard events wrong |
|---|---|
| Use `saved_state` as is | 6 / 6 |
| Last `edit.apply` per field wins (ignore undo/redo) | 3 / 6 |
| Undo/redo, but a new edit doesn't clear redo | 2 / 6 (crop + position) |

Because XOR shares are all-or-nothing (any 5 of 6 are independent uniform noise), there is
no partial credit to hill-climb. Brute-forcing a missing crop is about 13k offsets × 2 flips
per event, so guessing more than one wrong event is out of reach.

The video and wav are optional hints only. Nothing perceptual is on the critical path.
