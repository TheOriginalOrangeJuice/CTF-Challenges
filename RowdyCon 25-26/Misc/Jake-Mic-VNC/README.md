# FISH.EXE — CTF Challenge

A Windows 95 themed automation challenge. Can you tame the spinning fish?

---

## Challenge Description

You connect to a Windows 95 desktop running **fish.exe**, which opens two windows:

| Window | Description |
|--------|-------------|
| **The Spinning Fish** | Animated GIF playing CW or CCW based on a seeded sequence |
| **Control Panel** | A static frame of the fish you can rotate with ◄ CCW / CW ► buttons |

Every **5 seconds** the challenge picks a new direction (clockwise or counter-clockwise) from a deterministic seed. You must rotate the static fish to match the animated fish's direction **for 12 consecutive 5-second intervals (60 seconds total)** to reveal the flag.

Doing this by hand is painful. **Automate it.**

---

## Quick Start

```bash
# Build & run
docker compose up --build

# Connect via browser
open http://localhost:6080/vnc.html

# Challenge API (from your host machine)
curl http://localhost:8080/api/status
```

---

## API Reference

### `GET /api/status`

Returns the current challenge state.

```json
{
  "current_direction": "cw",
  "time_remaining": 3.14,
  "consecutive_correct": 5,
  "needed_to_win": 12,
  "last_player_direction": "cw",
  "flag": null
}
```

`flag` becomes the actual flag string once you win.

### `POST /api/rotate`

Rotates the static fish. Body must be JSON:

```json
{ "direction": "cw" }
```

or

```json
{ "direction": "ccw" }
```

Response includes `match: true/false` so you know immediately if you're correct.

---

## Automation Hint

The core loop is simple:

```python
import requests, time

API = "http://localhost:8080"

while True:
    st = requests.get(f"{API}/api/status").json()
    if st["flag"]:
        print("FLAG:", st["flag"])
        break
    direction = st["current_direction"]
    requests.post(f"{API}/api/rotate", json={"direction": direction})
    time.sleep(0.4)
```

---

## How the Direction Sequence Works

The direction for each 5-second window is derived from a seed:

```python
import random, time
seed = int(time.time() / 5)
direction = random.Random(seed).choice(["cw", "ccw"])
```

This is fully deterministic — you can predict future directions if you want to get fancy.

---

## Ports

| Port | Service |
|------|---------|
| `6080` | noVNC web interface (`http://localhost:6080/vnc.html`) |
| `8080` | Challenge HTTP API |

---

## Flag Format

```
CTF{...}
```
