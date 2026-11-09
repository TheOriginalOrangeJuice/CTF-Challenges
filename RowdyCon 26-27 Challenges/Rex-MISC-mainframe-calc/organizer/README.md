# Mainframe Calculator

| | |
|---|---|
| **Category** | Web / Misc / Scripting |
| **Difficulty** | Medium |
| **Flag** | `RCC{sc4n_d3c0d3_c4lcul4t3_r3p34t}` |
| **URL** | `http://<host>:8080/` |

Plain HTML forms. No JavaScript anywhere, so it works from `curl`, a phone, or a script.

## Player-facing description

> The RoudyCon mainframe still does payroll, but its display died years ago.
> Jobs come off the line printer as QR codes, and the night-shift operators
> got into the habit of wrapping each job in *some* encoding first. Nobody
> remembers which. It may not even be the same one twice.
>
> It has 33 jobs for you. It is not a patient machine. It is not a fast one either.
>
> `http://<host>:8080/`

## How it works

Every page is one round, one flag character:

1. `GET /start` opens a queue and renders a QR code (inline PNG) plus a form with
   `ticket`, `result`, and a hidden signed `token`.
2. The QR payload is a **job** wrapped in a random encoding: `base64`, `base32`,
   `hex`, `rot47`, or single-byte `xor` (hex-encoded). Round 1 is always base64
   so players get a foothold; after that it is a mystery every round.
3. The decoded job looks like `#482913: 17 * 4 + 14`. The expression is integer
   arithmetic and evaluates to **one flag character XOR one pad byte**. The pad
   is unique to the queue and only the server can compute it, so the values the
   player punches in never spell the flag — the server unmasks the run at the end.
4. `POST /answer` with the ticket and result before the deadline renders the next
   job. Wrong or tampered submissions render a "hangs up" page.

Then one of three endings:

| Outcome | Condition | Page |
|---|---|---|
| **Too fast** | all 33 cleared in under `TOO_FAST` s (default 10) | "Calc stands for calculator." linking to https://youtu.be/qy2fr9d5J3M. No flag. |
| **Too slow** | any job answered after its deadline | The "Oh you almost had it / you've gotta be quicker than that" image (`server/static/too_slow.jpg`, a bundled copy of the gstatic thumbnail you gave). No flag. |
| **Just right** | all 33 cleared, at pace | The server unmasks the run and prints the **flag** on the finish page (`<code id="flag">`). Nothing for the player to decode. |

So a bare automated solver hits the video first. The player has to notice the
"nobody reads a line printer that fast" line, add a delay, and run again. Human
speed is still impossible because of the 5 s per-job deadline. The window that
works is roughly 0.3 s to 5 s per job.

Timeouts default to 30 s for the first job (so people can scan it with a phone and
poke at CyberChef) and 5 s for every job after that.

**No sessions, no database.** Round state (round number, queue id, start time,
deadline, and an HMAC commitment to the expected ticket+result) lives in the signed
hidden field. The pad is `HMAC(SECRET, queue, round)`. Nothing is stored, so
restarts are free and it scales sideways if every replica shares `SECRET`. The
token is signed, not encrypted, but the expected answer is only present as a keyed
commitment, so decoding the token reveals nothing useful.

**Why the ticket?** Without it, each round's expected answer would be a single
byte (256 possibilities), and a script could brute-force its way through without
ever touching a QR code. The ticket is random per job and only obtainable by
decoding the QR and the cipher.

## Deploy

```sh
docker compose up -d --build
# or, without Docker:
pip install -r server/requirements.txt && python3 server/server.py
```

Configuration is via environment variables (see `docker-compose.yml`):

| Variable | Default | Meaning |
|---|---|---|
| `FLAG` | `RCC{sc4n_d3c0d3_c4lcul4t3_r3p34t}` | Printable ASCII, no spaces. One round per character. |
| `PORT` | `8080` | Listen port (dev server; the Docker image uses gunicorn on 8080). |
| `FIRST_TIMEOUT` | `30` | Seconds allowed for job 1. |
| `ROUND_TIMEOUT` | `5` | Seconds allowed for every other job. |
| `TOO_FAST` | `10` | Whole run faster than this many seconds gets the video instead of the flag. `0` disables. |
| `MEME_URL` | `https://youtu.be/qy2fr9d5J3M` | Where the too-fast ending links. |
| `SLOW_IMAGE` | `/static/too_slow.jpg` | Image on the too-slow page. Any URL works. |
| `SECRET` | random per start | HMAC key for tokens and pads. Set it when running several replicas. |

## Intended solution

See `solution/solve.py` (needs `pip install -r solution/requirements.txt`):

```sh
python3 solution/solve.py http://<host>:8080              # paced at 0.35 s/job -> flag
python3 solution/solve.py http://<host>:8080 --delay 0    # too fast -> video, no flag
```

1. Fetch `/start`. Regex the base64 PNG out of the `<img>` and the `token` out of
   the hidden field.
2. Decode the QR with any library (`zxing-cpp`, `pyzbar`, OpenCV).
3. Run the payload through each candidate decoder and keep the one whose output
   matches `#<digits>: <expression>`. XOR is brute-forced over 255 keys with the
   same check.
4. Evaluate the expression (integer division is exact) and `POST /answer` with
   `token`, `ticket`, `result`. Sleep a bit. Loop on the page that comes back.
5. Read the flag straight off the finish page (`<code id="flag">`). No post-processing —
   the mainframe unmasks the run and prints it once you clear the queue at pace.

## Layout

```
server/server.py            Flask app: pages, ciphers, QR, signed tokens, pad
server/static/too_slow.jpg  the too-slow meme image
server/Dockerfile           gunicorn image
docker-compose.yml          deployment with all knobs
solution/solve.py           reference solver (do not ship to players)
```
