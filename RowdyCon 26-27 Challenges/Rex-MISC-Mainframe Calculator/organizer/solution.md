# Mainframe Calculator — Solution

**Flag:** `RCC{sc4n_d3c0d3_c4lcul4t3_r3p34t}`

The name of the challenge is also the walkthrough: you **scan** a QR code, **decode**
whatever the night shift wrapped it in, **calculate** the sum inside, and **repeat**
until the queue runs dry. Do that at a believable pace and the machine prints your flag.
Here's the whole thing, start to finish.

## Looking around first

Open `/` and the mainframe explains itself: the display's dead, so jobs print as QR
codes, each one wrapped in some encoding nobody remembers, and there are 33 of them.
Click through to `/start` and you land on a job page. It's not much — a line of status
text, one QR code as an inline PNG, and a little form that posts a `ticket`, a
`result`, and a hidden `token` to `/answer`.

That `token` is worth a second look, because it's the whole reason there's no login and
no cookie. There's no session on the server at all. Everything about where you are in
the run — the round number, your queue id, when the run started, when *this* job is due,
and a sealed copy of the expected answer — is packed into that signed token and travels
with every request. You don't manage state; you just keep handing back whatever token
the server last gave you.

Play with it by hand once and you'll also trip over the thing that makes this challenge
more than a decode-a-thon: how it ends. There are three ways out.

- Miss a deadline — 30 seconds on the first job, 5 on every one after — and the line
  hangs up with a smug "gotta be quicker than that" image. No flag.
- Clear every job but finish the *whole run* in under ten seconds, and the operator
  decides nobody reads a printer that fast, pockets the punch card, and points you at a
  music video instead. Also no flag.
- Clear every job at a sane, human-ish pace, and the mainframe prints your flag.

That middle outcome is the trap. The obvious solver — fire requests as fast as the
network allows — sails through all 33 jobs and lands straight on the video. The "it is
not a fast one either" line in the brief and the "nobody reads a line printer that fast"
line on the finish page are both telling you the same thing: slow down on purpose. The
window that works runs from about 0.3 s per job (any quicker and the total dips under
the ten-second floor) up to 5 s (any slower and you blow a deadline). Park yourself in
the middle at roughly **0.35 s per job** and you never have to think about it again.

## Scanning the code

Pull the base64 out of the `<img src="data:image/png;base64,…">`, turn it back into PNG
bytes, and feed it to any QR reader — `zxing-cpp` is the least fussy, but `pyzbar` or
OpenCV are fine. What comes back is *not* the job yet. It's the job after one more layer
of wrapping.

## Peeling off the encoding

That extra layer is the "mystery" the brief keeps hinting at. The first round is always
base64, to give you somewhere to stand. Every round after it picks one of five classic
encodings at random and never tells you which: base64, base32, hex, rot47, or a
single-byte XOR printed as hex.

The nice part is you don't have to *recognise* which one you got. A real job always
looks like this:

```
#482913: 17 * 4 + 14
```

— a `#`, some digits, a colon, and then nothing but numbers, spaces and `+ - * /`. So
just try all five decoders and keep the one whose output matches that shape
(`^#(\d+): ([\d\s+\-*/]+)$` if you want it exact). base64, base32, hex and rot47 either
throw or hand back obvious garbage; only the right one produces a job. XOR is the single
fiddly case: decode the hex, then run through all 255 single-byte keys and keep the key
whose plaintext matches — same regex doing the same job as an oracle.

## Doing the sum

The expression is ordinary integer arithmetic with normal precedence, and `/` is
integer division (the server only ever builds divisions that come out even, like
`102 / 6`). Every answer lands somewhere in 0–255.

One word of caution: this is attacker-controlled text, so don't `eval()` it. Parse it
with `ast` and walk the tree allowing only `+ - * /`, or write a tiny shunting-yard
evaluator. It's two dozen lines and it means a weird payload can't bite you.

## Why you can't just guess your way through

You might notice each answer is only a single byte and wonder why you can't skip the QR
entirely and brute-force `/answer` — 256 tries isn't much. That's exactly what the
`ticket` is there to stop. The server doesn't check your answer directly; it checks it
against a sealed commitment baked into the token, roughly
`HMAC(secret, "answer:<queue>:<round>:<ticket>:<result>")`. A submission only clears if
*both* the random six-digit ticket and the right result match — and the only place that
ticket exists is inside the QR. So you really do have to scan every job.

And yes, the token is signed, not encrypted, so you can base64-decode it and read the
round number, the queue id, the timestamps and that commitment. It won't help: the
commitment is a keyed hash, and without the server's secret you can neither read an
answer out of it nor forge a fresh token.

## Why the answers look like noise (and why you don't care)

Keep a running list of your results as you go and you'll notice they don't spell
anything. That's deliberate, and it's the whole point of the pacing gate. Each answer is:

```
your answer  =  flag character  XOR  a secret mask byte
```

where the mask is `HMAC(secret, "pad:<queue>:<round>")[0]` — derived server-side, never
stored, impossible for you to compute. So nothing you punch in during the run reveals a
flag character, which is exactly why finishing too fast can be punished: a
blink-and-it's-done run only ever collected masked bytes.

Here's the nice part: **you never un-mask anything yourself.** Clear the queue at a sane
pace and the server does it for you, printing the flag straight onto the finish page:

```html
<code id="flag">RCC{sc4n_d3c0d3_c4lcul4t3_r3p34t}</code>
```

Read it off and you're done.

## The loop, end to end

Strip away the prose and the solver is small:

```
page = GET /start
while the page still has a token and a QR:
    token   = the hidden token on the page
    payload = decode_qr(the inline PNG)
    ticket, expr = try all five decoders, keep the one that matches a job
    result  = integer-evaluate(expr)
    sleep ~0.35 s                     # the one line that actually matters
    page = POST /answer {token, ticket, result}

flag = the <code id="flag"> off the final page    # the server already un-masked it
```

## Running the reference solver

`solution/solve.py` is exactly that loop. Install its two dependencies (Pillow and a QR
decoder) and point it at the target:

```sh
pip install -r solution/requirements.txt
python3 solution/solve.py http://<host>:8080            # paced at 0.35 s/job → the flag
python3 solution/solve.py http://<host>:8080 --delay 0  # go too fast on purpose → the video
```

Run normally it narrates each job and finishes with the flag:

```
[ 1] base64 #482913  17 * 4 + 14   = 82
[ 2] rot47  #731205  200 / 4       = 50
 …
flag -> RCC{sc4n_d3c0d3_c4lcul4t3_r3p34t}
```
