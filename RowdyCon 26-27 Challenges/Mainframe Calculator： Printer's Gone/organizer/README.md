# Mainframe Calculator: Hard

| | |
|---|---|
| **Category** | Web / Misc / Scripting |
| **Difficulty** | Hard |
| **Flag** | `RCC{th3_pr1nt3r_h4s_s33n_b3tt3r_d4ys}` |
| **URL** | `http://<host>:8081/` |

Same game as the easy version in `../mainframe-calc-easy`: QR code, mystery cipher, integer
arithmetic, `<ticket> <result>`, per-run pad, three endings, no JavaScript. The
difference is the line printer. Round 1 is clean. After that, every job comes out
with one of twelve faults, in shuffled cycles, so each fault shows up about three
times per run. A browser still shows something a human recognises as a QR code. A
script has to repair the fault before any decoder will read it.

## Player-facing description

> The RoudyCon mainframe still does payroll, but its display died years ago. Jobs
> come off the line printer as QR codes, wrapped in whatever encoding the night
> shift felt like that day.
>
> The printer has seen better days too. The paper feed slips, the ribbon is nearly
> dry, the colour heads drifted, the print head strobes, and when it jams the
> operators fall back to the braille embosser or just type the thing in as a table.
> Every job comes out wrong in its own way.
>
> 37 jobs. Your phone can probably still read them. Your script will have to work for it.
>
> `http://<host>:8081/`

## The faults

Each fault is a function in `server/faults.py`. The job page names the fault in its
header line, so players know what they are looking at; figuring out the repair is
the challenge.

| Fault | What the page shows | What a naive decode gets | Intended repair |
|---|---|---|---|
| `wavy_gif` | An animated GIF, 16 to 24 frames, the QR rippling like the paper feed slipped. One frame is clean. | Frame 0 is warped; nothing. Across 30 test GIFs, 0 of 583 warped frames decoded. | Split the GIF into frames and try each. |
| `blinds_gif` | A strobing GIF. Each frame carries only a few rows of the code. | Nothing; no single frame has enough. | Stack the frames and take the darkest pixel at each position. |
| `diff_gif` | Two frames of static. | Nothing. | The QR is the absolute difference between the two frames. |
| `isolum` | Red modules on a green background. | Nothing. Both colours have identical Rec. 601 luminance, and there is per-pixel jitter, so greyscale is a flat field. | Read a single colour channel. |
| `alpha` | A normal-looking QR. | A junk payload. The visible code is a decoy; the real one is in the alpha channel, 250 versus 255. | Read the alpha channel and stretch its contrast. |
| `lowcontrast` | A grey square. | Nothing. Two greys one or two levels apart. | Autocontrast or threshold at the midpoint. |
| `noise` | A QR under heavy salt-and-pepper noise, a third of the pixels. | Nothing. | Median filter, about 7 px. |
| `interlace` | Two QR codes printed over each other in 4 px horizontal bands. | The junk one. The bands are offset so every module centre lands in the decoy. | Keep the real bands at the right offset and stretch them back to square. |
| `tiles` | A perfect QR in the browser. | Nothing. The DOM holds 16 shuffled, rotated tiles placed by CSS `grid-row`, `grid-column` and `transform: rotate()`. | Undo the rotation, paste each tile by its grid position. |
| `table` | A perfect QR in the browser. | There is no image. It is an HTML table of coloured cells, run-length encoded with `colspan`. | Expand each `<td>` by its colspan, threshold the colour, rasterize. |
| `braille` | A QR made of Unicode braille glyphs. | There is no image. | Each character is 2 by 4 modules; the dot bits map to the standard braille layout. |
| `split` | Two or three QR codes in random order. | Payloads like `2/3\|...`; none is a job by itself. | Decode all, sort by index, join, then crack the cipher. |

Every fault was checked 24 times: the reference repair succeeded every time, and a
straight decode of the raw image succeeded zero times. The easy version's other
protections (ticket, pad, signed token, deadlines) are unchanged.

## Deploy

```sh
cd mainframe-calc-hard && docker compose up -d --build
# or, without Docker:
pip install -r server/requirements.txt && python3 server/server.py
```

Same environment variables as the easy version (`FLAG`, `PORT`, `FIRST_TIMEOUT`,
`ROUND_TIMEOUT`, `TOO_FAST`, `MEME_URL`, `SLOW_IMAGE`, `SECRET`); see
`docker-compose.yml`. The fault schedule is derived from the queue id and `SECRET`,
so it needs no storage and replicas agree on it.

Page sizes: most jobs are a few KB. `wavy_gif` is about 145 KB and `diff_gif` and
`isolum` about 100 KB, because random pixels do not compress.

## Intended solution

`solution/solve.py` (needs `pip install -r solution/requirements.txt`) is the easy
solver plus a repair pipeline. For every job page it generates candidate images,
cheapest first, and hands each to the decoder until one payload cracks into a job:

- braille `<pre>`, `<table>`, and CSS-grid tiles are rebuilt into a module matrix,
- a GIF yields every frame, the min-composite, and the difference of each
  consecutive pair,
- a PNG yields itself, autocontrast, the alpha channel, each RGB channel, a median
  filter, and every line and band de-interlace.

Split payloads are collected by index and joined. Each repair takes under 30 ms, so
the 5 s deadline is not the constraint; the 0.35 s per-job pause is, because the
run has to stay above `TOO_FAST` for the mainframe to print the flag.

```sh
python3 solution/solve.py http://<host>:8081        # paced, prints which repair won each job
python3 solution/solve.py http://<host>:8081 -v     # also prints every candidate tried
```

## Layout

```
server/server.py            Flask app: base game plus fault scheduling
server/faults.py            the twelve faults (and the clean renderer for round 1)
server/static/too_slow.jpg  the too-slow meme image
server/Dockerfile           gunicorn image on 8081
docker-compose.yml          deployment with all knobs
solution/solve.py           reference solver with the repair pipeline (do not ship)
```
