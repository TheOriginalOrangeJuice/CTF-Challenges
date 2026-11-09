# Highrise Trickshot (web / client-side, easy-medium)

**Description for players:** Trickshot-only lobby on Highrise. The host will give you the flag
if you hit a trickshot worth **10,000,000,000 points**. Good luck, MLG pro.

## Run
    docker compose up --build -d     # http://localhost:8081
Change the flag with the `FLAG` env var in docker-compose.yml.

## Map
Simple block greybox loosely following the Highrise overhead layout: north and south office
buildings (walk-in, with a ladder to the north roof), a central rooftop with a raised helipad
(parked helicopter) and machine deck on the west half, and two crossing cranes off the west
edge. Step onto the steel landings at the west edge to walk out on the crane booms.
You spawn on the east side of the roof; the dummy spawns on the helipad.

## Solution (organizers only)
Full step-by-step writeup with test results: see `SOLUTION.md`.

The client never reports a score. How it works:
1. `POST /api/session` gives a one-time ticket and the dummy's spawn (server-chosen).
2. On takeoff the client sends `/api/takeoff` with its `CONFIG` + starting state. That locks in
   the settings for this jump.
3. On the kill it sends the frame-by-frame inputs (dt, mouse yaw, pitch, keys, swaps, scope
   presses, shots + spread rolls, knife throws). The server re-simulates the jump with the
   committed `CONFIG`, checks the final bullet/knife really hits its dummy (knife physics uses
   the map boxes exported from `static/map.js`), checks the airtime against wall-clock time,
   burns the ticket, and computes every multiplier itself.

So replaying a request fails (ticket used), editing stats is impossible (none are sent), and
editing the final packet can't change the settings (already committed at takeoff).

Intended path: edit the `CONFIG` object in `game.js` (DevTools → Sources → Overrides) and then
actually pull off the trickshot, e.g. a much lower `GRAVITY` (lots of airtime to spin in; there's no turn-rate cap, sensitivity goes to 100),
`GRAVITY` lower for airtime, `NOSCOPE_SPREAD: 0`. The perk shop hints at exactly these keys.
Legit play (even with every perk) tops out far below 100M.

Tested: 48,532× 360 noscope headshot with edited CONFIG = 158,845,973 pts -> flag.
