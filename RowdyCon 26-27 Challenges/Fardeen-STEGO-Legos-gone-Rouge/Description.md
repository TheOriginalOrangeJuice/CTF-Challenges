# NINJAGO: Ghost Broadcast

**Steganography · Upper-Medium to Hard**

## Description

I went to the flea market and someone was selling a VHS copy of Ninjago! I decided to pick it up, but when I played it, I realized it was a bit weird. My original VHS copy is way faster. To be honest, someone back in elementary school told me about a secret copy of Ninjago released on the market back in 2010. I wonder if this is the copy. Can you compare the two VHS tapes and find the secret?
## Files

Single Docker container. Run from this folder:

```bash
docker build -t rowdy-ninjago:2026 challenge
docker run -d --name rowdy-bbc-2026 --read-only \
  --cap-drop=ALL --security-opt=no-new-privileges \
  --pids-limit=64 --memory=256m \
  -p 18103:18103 rowdy-ninjago:2026
```

Open **http://localhost:18103**. Players receive the URL; both lossless recordings and their frame index are downloadable from **Tape Library**. All equipment and media run locally. `docker restart rowdy-bbc-2026` resets the stateless server; **Reset desk** clears browser controls and recordings. Keep `organizer/`, `screenshots/` and this submission document private. [Regeneration and checks](organizer/OPERATIONS.md) are organizer-only.

## Hint(s)


## Walkthrough

Sync the two VHS tapes by adjusting their positions and playback speeds until matching scenes appear at the same time. Select **Difference** to leave only the hidden light trail, and use **Gain** if it looks too dim. Record both sections, adjusting the sync after the extra scene on Tape B. Replay the recording with **Hold** enabled so the trail builds into a complete picture. Read the flag and submit it under **Broadcast authorization**.

1. Select **View tapes** to see both recordings on the television. In the decks' **FRAME** boxes, compare A **48** with B **78**: both reach the Fire Temple shot. Compare A **240** with B **270**: both reach the dragon shot. Their times are 2.000 / 3.120 seconds and 10.000 / 10.800 seconds.

![Matching Ninjago pictures on the two tape inputs](screenshots/matching-screen.png)

2. B covers 7.680 seconds while A covers 8.000, so set **B RATE** to **96%**; leave A at **100%**. Use **B time = 0.96 × A time + offset**. The initial offset is 1.200 seconds. Select **DIFFERENCE**, then **OUTPUT** on the mixer. Matching frames now produce a small moving light on black.

3. Set **A FRAME = 0**, **B FRAME = 30**, and **A OUT = 287**. Leave Hold off. Press **REC** once to arm the output recorder, then **PLAY BOTH**. The decks stop at A's OUT point; the recorder contains **0288 FRAMES**.

4. B has an extra two-second Kai shot before the Green Ninja scene. That shared scene begins at A **288** and B **368**, so the new offset is 3.200 seconds. Set those FRAME values and **A OUT = 575**. Keep B at 96% and the recorder armed. Press **PLAY BOTH** again. The recorder now contains **0576 FRAMES**.

5. Press **REC** to disarm it. Press **HOLD**, then the output recorder's **PLAY**. Hold takes the maximum brightness at each pixel across the recorded Difference frames. The moving trace builds a ninja mask, Spinjitzu rings and the complete authorization. Both aligned portions are needed: each contains different complete characters.

![Actual CRT output after the recording is replayed through Hold](screenshots/held-screen.png)

6. Read `RCC{ghost_7c2e9a4f1b6d8e03}` from the picture. Select **Enter authorization**, enter the code in **Broadcast authorization**, and press **Restore**.

![The server accepts the authorization recovered from the television](screenshots/accepted.png)

The same result can be obtained with live **Difference + Hold**: pause and turn Hold off while re-cueing the tapes at the splice, then turn it back on. **Clear** erases the accumulated image. External analysis is also supported: [the reference receiver](organizer/recover.py) discovers picture correspondences from the two public FFV1 downloads, infers the timing segments and accumulates their actual pixel differences; it reads no private alignment or flag fixture.

## Flag

`RCC{ghost_7c2e9a4f1b6d8e03}`

