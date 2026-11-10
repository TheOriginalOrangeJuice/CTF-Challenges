# Mainframe Calculator: Hard — Solution

**Flag:** `RCC{th3_pr1nt3r_h4s_s33n_b3tt3r_d4ys}`

Underneath, this is the easy Mainframe Calculator with a broken printer bolted on top.
The web protocol, the five mystery encodings, the integer sums, the ticket, the
pad-masked answers, the too-fast and too-slow endings — all of it is
unchanged. If you haven't solved the easy one yet, do that first; its writeup covers the
base game in full and this one won't repeat it. What's new, and all this writeup is
about, is that from job two onward the QR code arrives mangled, and you have to put it
back together before any decoder will look at it twice.

## Get the base game working first

Quick refresher on the parts that carry over, because your solver needs every one of
them before the faults matter at all. Each job is a page with a status line, a QR (in
some state), and a form posting `token`, `ticket`, `result` to `/answer`; the server is
stateless and the signed token carries your place in the run. The payload, once you
reach it, is `#<ticket>: <expression>` wrapped in base64 / base32 / hex / rot47 /
single-byte-XOR — round one is base64, the rest are a guess, so try all five and keep
whatever matches a job. The sum is integer `+ - * /` (parse it with `ast`, don't
`eval()` it), and every answer is a flag byte XOR a secret mask byte, so your results
look like noise — but you never un-mask anything yourself: finish at pace and the server
prints the flag on the finish page for you.

The pacing trap is identical too, and it still bites: clear the whole run in under ten
seconds and you get a music video instead of the card; miss a deadline (30 s on job one,
5 s after) and you get the "quicker than that" image. About 0.35 s per job keeps you in
the clear — with 37 jobs that's roughly thirteen seconds end to end. The repairs below
all run in a few milliseconds, so the five-second deadline is never your problem; the
deliberate pause is the only thing standing between you and the flag.

## Now, the printer

Job one is clean. After that the server walks a shuffled cycle through all twelve faults,
reshuffling each lap, so every fault turns up about three times across the run and never
twice in a row. The status line names the one you're looking at:

```
Queue <id> · job <r>/<n> · <timeout> s on the clock · fault: <name>
```

You *could* read that name and branch on it. Don't — it's more code and one typo from
breaking. The job regex from the base game is a perfect oracle: only the genuine payload
ever matches it. So the robust shape is to throw a pile of candidate repairs at each
page, hand every one to the decoder, and keep the first payload that cracks into a job.
Generate the candidates cheapest-first and you stop early almost every time. The faults
below sort into four families, and once you can produce the right candidate for each
family you're done — you never actually have to identify which fault you got.

### The ones hiding in a GIF

Three faults ride in an animated GIF, and all three fall to the same handful of frame
tricks. **`wavy_gif`** is the paper feed slipping: sixteen to twenty-four frames, each
rippled by its own sine wave — except one clean frame buried in the stack. Split the GIF
and try every frame; the clean one just decodes. **`blinds_gif`** is the strobing print
head, where each frame only carries a few rows of the code and the rest is white; no
single frame is enough, but stack them all and keep the darkest pixel at each position
(a min-composite) and the whole code reassembles. **`diff_gif`** is two frames of pure
static that each decode to nothing — the code is the *difference* between them, because
wherever a real module is dark one frame's pixel is shoved 128 away from the other's, so
threshold the absolute difference and there it is.

In practice one generic GIF candidate set covers all three: every individual frame, the
min-composite of all frames, and the thresholded diff of each consecutive pair.

### The ones hiding in a colour channel

Five faults are PNGs that a straight greyscale decode throws away. **`isolum`** prints
red modules on a green background chosen to have identical luminance, plus a little
per-pixel jitter, so greyscale genuinely sees a flat field — but the individual red and
green channels are not flat, so read one channel and autocontrast it. **`alpha`** shows a
perfectly real, scannable QR in its RGB — which is a decoy; the real code lives in the
alpha channel as 255-versus-250, invisible until you pull that channel out and stretch
its contrast. **`lowcontrast`** is the dry ribbon: two greys one or two levels apart, so
autocontrast or a midpoint threshold brings it right back. **`noise`** flips about a
third of the pixels to random black-and-white salt-and-pepper, which a ~7 px median
filter wipes away while leaving the modules intact. **`interlace`** is the sneaky one —
the real code is laid down in thin horizontal bands with a decoy filling the gaps, and
the bands are offset precisely so a decoder's sample points land in the decoy; keep only
the real bands at the right offset and stretch them back to square (repeat each kept row
twice). If you'd rather not compute the offset, just sweep it 0–7 and let the oracle pick.

So the generic PNG set is: the image as-is, autocontrast, the alpha channel, each of the
R/G/B channels, a 7 px median, the two classic line-interlace phases, and each of the
eight band de-interlaces. Something in there always lands.

### The ones that were never images

Three faults don't give you a picture at all — they're HTML the browser *draws* as a QR,
so there's nothing to feed a decoder until you rebuild the module grid yourself from the
markup. **`table`** is an HTML `<table>` of coloured cells, run-length-encoded with
`colspan` and the colours jittered; walk each `<tr>`, expand every `<td colspan="k">`
into k modules, and call a cell dark when its background luminance is under 128.
**`tiles`** cuts the code into a 4×4 grid of sixteen PNG tiles, rotates each by
0/90/180/270°, shuffles them into random DOM order, and only puts them back via CSS
`grid-row` / `grid-column` / `transform: rotate()`; parse each `<img>` for its grid
position and rotation, un-rotate it (CSS rotates clockwise and PIL counter-clockwise, so
rotate by `-angle`), and paste it at `((col-1)·t, (row-1)·t)`. **`braille`** embosses the
code as a `<pre>` of Unicode braille, each glyph a 2-wide, 4-tall patch of modules;
subtract `0x2800` from each character to get its dot byte and spread the bits back into
the grid with the standard braille mapping:

```
0x01 → (0,0)   0x08 → (0,1)
0x02 → (1,0)   0x10 → (1,1)
0x04 → (2,0)   0x20 → (2,1)
0x40 → (3,0)   0x80 → (3,1)
```

Rebuild the boolean matrix, render it as a clean black-on-white image with a quiet zone,
and decode that like any other.

### The one split across several codes

**`split`** is the job that didn't fit on one label, so it's printed across two or three
separate QR codes, each prefixed `i/n|`, in random order on the page. Each one decodes
fine on its own but fails the job regex, because it's only a slice of the enciphered
text — that's the trap, and it's why you can't just crack the first payload you see.
Collect the parts keyed by their index, and once you have all n, sort them, join them,
and *then* run the cipher cracker on the whole string.

## Putting the pipeline together

For each job page: gather candidates cheapest-first, decode each, and watch for split
parts as you go.

```
for each job page:
    parts = {}
    for (label, image) in candidates(page):     # braille/table/tiles first, then GIF, then PNG variants
        payload = decode_qr(image)
        if payload is None:            continue
        if payload looks like "i/n|…":           # a split part
            stash it by index; once all n are in, join and try to crack → job? done
        elif crack(payload) is a job:            done
    evaluate the sum, submit, sleep ~0.35 s, move on
```

The `candidates()` generator yields, in order: a braille rebuild if the page has a
`<pre class="braille">`; a table rebuild if it has a `<table class="qrt">`; a tiles
rebuild if it has a `<div class="tiles">`; and then, for every inline `data:` image, the
GIF variants or the PNG variants described above. Because the regex only ever accepts the
real payload, a broad-enough candidate list means you never have to be right about *which*
fault you're facing — the header name is just there to make your logs readable.

## Running the reference solver

`solution/solve.py` is the easy solver with this repair pipeline grafted on. It wants
Pillow, NumPy, and a QR decoder (`zxing-cpp` is easiest; `pyzbar` or `opencv-python` work
too):

```sh
pip install -r solution/requirements.txt
python3 solution/solve.py http://<host>:8081        # paced; prints which repair won each job
python3 solution/solve.py http://<host>:8081 -v     # -v also prints every candidate it tried
```

It narrates a line per job — the fault, the repair that cracked it, the encoding, the
sum — and ends on the flag:

```
[ 1] plain    via as-is           base64 #482913 17 * 4 + 14  =  82  (0.01s)
[ 2] isolum   via img0 channel R  hex    #731205 6 * 9 - 4    =  50  (0.02s)
[ 3] braille  via braille         rot47  #118244 220 / 5      =  44  (0.00s)
 …
flag -> RCC{th3_pr1nt3r_h4s_s33n_b3tt3r_d4ys}
```
