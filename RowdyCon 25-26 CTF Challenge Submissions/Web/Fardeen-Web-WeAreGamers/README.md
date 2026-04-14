# Queue Dodge 95


# Scenario: I just came home and just wanted to lock in Draven Bot Lane... but there's this Purple... creature constantly talking in my ear about doing "Leet Code". I can't even click the accept button anymore. I don't even care about getting rid of the creature, JUST HELP ME CLICK THE ACCEPT BUTTON SO I CAN QUEUE!!!


`Queue Dodge 95` is a very hard web challenge that recreates a fake Windows 95 era League of Legends launcher. The visible challenge is simple: click `ACCEPT` before `Bonzai Buddy` clicks `DECLINE`. The real challenge is uncovering the faster legacy code path, understanding the launcher protocol, and scripting the ready-check race.

## Challenge Design

- Category: `web`
- Difficulty: `very hard`
- Core skills: websocket inspection, client-side reversing, protocol recreation, concurrency, timing
- Theme anchors: Windows 95 UI chrome, faux League client flow, legacy `WM_COMMAND`-style control messages

## Intended Solve Path

- Players discover the normal `ACCEPT` button is unwinnable because the UI route is intentionally slow.
- Source inspection reveals a hidden legacy endpoint modeled after an old launcher window procedure.
- The ready-check websocket event leaks the queue ticket and legacy nonce needed to calculate a valid command.
- Players script concurrent `ACCEPT` requests over the hidden endpoint before the malware task finalizes a decline.

## Files

- `app/main.py`: FastAPI app, queue state, websocket events, hidden legacy protocol, Bonzai race logic
- `app/templates/index.html`: Windows 95 themed fake League launcher
- `app/static/style.css`: retro launcher styling
- `app/static/client.js`: visible launcher behavior and slow UI click route
- `app/static/bonzai-buddy.js`: leak of the hidden legacy protocol used for the intended solve
- `solve.py`: organizer reference solver
- `SOLUTION.md`: detailed exploit explanation

## Run Locally

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Then open `http://127.0.0.1:8000`.

## Docker

Build the image from the `Dockerfile`:

```bash
docker build -t queue-dodge-95 .
```

Run the challenge container:

```bash
docker run --rm \
  --name queue-dodge-95 \
  -p 8000:8000 \
  -e FLAG='RCC{t3st_fl4g}' \
  -e SECRET_KEY='replace-this-in-production' \
  queue-dodge-95
```

Then open `http://127.0.0.1:8000`.

If port `8000` is already in use on your machine, bind a different host port:

```bash
docker run --rm \
  --name queue-dodge-95 \
  -p 8765:8000 \
  -e FLAG='RCC{t3st_fl4g}' \
  -e SECRET_KEY='replace-this-in-production' \
  queue-dodge-95
```

Then open `http://127.0.0.1:8765`.

Quick smoke test:

```bash
curl http://127.0.0.1:8000/healthz
```

Expected response:

```json
{"ok":true}
```

To stop the container, press `Ctrl+C` in the terminal running it, or if you launched it detached:

```bash
docker stop queue-dodge-95
```

## Deployment Notes

- Set a unique `FLAG` in the container environment.
- Replace `SECRET_KEY` in production so ticket signatures are not predictable across deployments.
- Do not ship `SOLUTION.md` or `solve.py` with player-facing downloadable files.
- The challenge is intentionally single-instance and in-memory. Restarting the service resets sessions.

## Hint Ladder

- Hint 1: Manual clicking is a bait path.
- Hint 2: Ready-check state arrives over a websocket and the launcher still contains legacy IPC glue.
- Hint 3: `Bonzai Buddy` already knows the fast endpoint.
- Hint 4: The winning click looks a lot more like `WM_COMMAND` than a normal button press.
