# DVD Logo Any%

**Misc · Easy**

## Description

My friends used to sit in front of the DVD bouncing logo and try to predict when the DVD would hit the corner perfectly. Now that I have my math PhD from Colorado School of Mines, I think I should be able to predict this quite easily. 

An old DVD promises a bonus feature after eight perfect predictions. The menu is just that familiar bouncing logo. I remember losing entire afternoons to this thing, and I have a convention to get back to.

## Files

Single Docker container, built from [challenge/](challenge/). From this folder:

```sh
docker build -t rowdy-dvd10:review challenge
docker run -d --name rowdy-dvd10-review -p 18110:18110 \
  --read-only --cap-drop ALL --security-opt no-new-privileges \
  rowdy-dvd10:review
```

Open `http://localhost:18110`. Players receive the URL and **Export all rounds** (`/api/rounds`). Keep the server image/source, organizer tools, screenshots, and this document private. Stop/update commands and session behavior: [organizer/AUTHORING.md](organizer/AUTHORING.md).

## Hint(s)

1. The moving point is the logo's corner, so its travel area is smaller than the full screen.
2. Mirror the screen at its edges. A bouncing path becomes a straight line through repeated rectangles.
3. Solve the horizontal and vertical boundary-hit congruences, then combine their periods. Some pairs have no common solution.

## Walkthrough

Use the exported dimensions and starting coordinates to predict each logo's first corner tick. Find when the horizontal and vertical motions reach their edges together, or enter `never` if they cannot. Eight accepted predictions unlock the flag without waiting.

1. Read **Original round data** beside the preview. Predict the first positive integer corner tick, or `never`. Tick zero does not count.

![Round 1 dimensions, starting position, velocity, and public export](screenshots/10-optical-1366.png)

2. Download the data with curl; replace the URL if needed. Round 1's screen is 14 by 9 and logo is 2 by 1. Subtract to get the top-left corner's travel bounds: **12 by 8**. Its start is `(3,3)` and velocity is `(1,1)`.

```sh
BASE=http://localhost:18110
curl -sS "$BASE/api/rounds" -o dvd-rounds.json
```

3. Mirror the screens so a bouncing path becomes straight. For round 1, `3+t` reaches a multiple of 12 at ticks 9, 21, 33… and a multiple of 8 at 5, 13, 21…. The first shared tick is **21**. Enter `21`, click **Lock in prediction**, then **Next round**.

4. For every other round, solve `v*t = -s mod B` on each axis: `s` is its starting coordinate, `v` its velocity, and `B` its effective bound. “Mod” means equal remainders after division. Set `g = gcd(v,B)`, the greatest common divisor. If `s` is not divisible by `g`, submit `never`. Otherwise the period is `p=B/g`; the hit times are `t=a mod p`, where `a=(-s/g)*inverse(v/g) mod p`. A modular inverse undoes multiplication; Python writes it as `pow(v//g, -1, p)`. If `p=1`, use `a=0`.

5. Combine the two schedules `t=a mod m` and `t=b mod n`. Set `g=gcd(m,n)`. If `(b-a)` is not divisible by `g`, they never meet: round 3 has `9 mod 12` and `3 mod 8`, so its answer is `never`. Otherwise write `t=a+m*k` and solve `k=((b-a)/g)*inverse(m/g) mod (n/g)`. Use `k=0` if `n/g=1`. Reduce `t` modulo `L=m*(n/g)`. When the result is zero, use `L` to obtain the first positive tick. These steps are the generalized Chinese remainder theorem.

6. Apply that calculation with Python 3.8+ and the linked [Python solver](organizer/solve.py), saved as `organizer/solve.py` under your working folder. Its `axis` function reduces each schedule, `predict` combines them, and `Client` keeps the session cookie while submitting answers in order. It reads only the public API. Python integers keep the large answers exact.

```sh
python3 -B organizer/solve.py "$BASE"
```

The predictions for rounds 1–8 are:

```text
01: 21       02: 22       03: never       04: never
05: 128      06: 537117701399620543       07: 4000000025
08: 7000000000000000003430000000000000000273
```

7. The script prints `cleared: 8` and the flag. To finish in the browser too, enter the remaining predictions in order and click **Next round** after each accepted answer. **Your calls** keeps the accepted predictions. Browser and script sessions are separate. After the final prediction, the reward appears beside the actual accepted corner. **Copy flag** copies the server-issued reward.

![The browser completes all eight rounds and displays the actual RCC reward](screenshots/16-complete.png)

## Flag

`RCC{c0rn3r_h1t_n0_w41t_crt_any_percent}`
