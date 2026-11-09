# Der Riese — Zombies (browser CTF challenge)

A complete, playable first-person Call of Duty: Zombies–style survival game on a faithful recreation of the
Der Riese layout, written from scratch in plain JavaScript (raw WebGL + Canvas2D + WebAudio). No build
toolchain, no external dependencies, no network calls, no `crypto.subtle` (works over plain HTTP anywhere).

The flag is awarded at **round 100**. The flag key is derived from a hash chain that is advanced only by the
real round-advance code path, so the intended solution is an in-browser hack that actually walks the chain —
a naive `round = 100` produces garbage.

## Running / hosting

```
python3 tools/gen_flag.py 'flag{your_flag_here}'   # writes flag_data.js
python3 tools/build.py                              # bundles everything into dist/
python3 -m http.server -d dist 8000                 # or any static file server
```

Deploy the `dist/` folder (two files). The repo-root `index.html` is the **dev page**: it loads the individual
sources and exposes `window.ZMDEV` for the tests — do not ship it.

### Browser performance

Everything in the game costs well under a millisecond per frame (press Esc in game to see the breakdown).
If the game still runs at ~20 fps, the browser is throttling presentation, not the game:

* **Chromium/Chrome/Edge** run it at the monitor's refresh rate.
* **Firefox on Linux** with hardware acceleration disabled, or with `privacy.resistFingerprinting` enabled,
  caps `requestAnimationFrame` at ~20 fps even for an empty page. Check `about:support → Graphics →
  Compositing`; in `about:config` set `privacy.resistFingerprinting` to false and `gfx.webrender.all` /
  `layers.acceleration.force-enabled` to true, then restart. `tests/bench.html` measures the raw browser
  frame rate with nothing drawn so you can tell the two cases apart.
* The render scale (Settings → Video, or `[` / `]`) lowers the internal 3D resolution for weak GPUs.

## Controls (all rebindable in Settings → Controls)

| Default | Action |
| --- | --- |
| WASD / Shift | Move / sprint |
| Mouse / RMB | Look / aim down sights (hold or toggle) |
| LMB | Fire |
| R | Reload |
| 1 / 2 / Q / wheel | Switch weapon |
| V | Knife |
| G | Frag grenade |
| N | Monkey bomb (from the box) |
| C | Place claymore (after buying claymores) |
| F | Interact: doors, wall guns, perks, Mystery Box, Power, electric traps, Teleporters, Mainframe, Pack-a-Punch, barrier repair (hold) |
| Esc | Pause (Settings / Quit) · Esc again: menu |
| M | Mute |
| F3 | Debug overlay |
| + / − | Mouse sensitivity |
| [ / ] | Render scale |

Settings (sensitivity, invert Y, ADS/sprint hold-or-toggle, FOV, render scale, FPS counter, view bob,
crosshair style, volume, key bindings) are saved in localStorage.

## The map

The layout follows the original Der Riese (World at War) room by room:

* **Mainframe yard** (spawn, outdoors): a big fenced courtyard with the mainframe on a raised, railed
  platform (solid underneath; stairs at two corners). Low concrete-and-chain-link fences on the north, west
  and south sides look straight into the walkways that wrap the yard, their catwalks and the "Waffenfabrik Der
  Riese" factory wall beyond. The two 750 gates are in the north and south fences. The solid east end holds
  Pack-a-Punch behind its gate, Quick Revive, the M14 and Olympia chalks and the four barricades.
* **Right walkway** (open air, catwalk overhead, M16) → 1000 door → **Auto garage** (Thompson, furnace, box) →
  stairs up → 1250 debris → **right balcony** → 1250 → **Teleporter B** (chemical lab, upstairs: MP5K, box,
  electric trap). The walkway's steel shutter into the courtyard opens with the power.
* **Left walkway** (open air, catwalk overhead, AK74u) → 1000 door → **Animal testing lab** (Stakeout, cages,
  box) → stairs up → 1250 debris → **left balcony**; 1250 → **Teleporter A** (generator room: MP40, furnace,
  box, electric trap). Its shutter into the courtyard also opens with the power.
* **Courtyard** (centre, outdoors): the big generator with the **power switch** behind it, Galil, Claymores,
  **Double Tap, Juggernog and Speed Cola**, a box spot. Reach it first by dropping off either balcony. Power
  opens the two factory-room roller doors and **lowers the bridge** between the balconies.
* 1250 → **Teleporter C hall** (main factory): AUG, Bowie Knife, Dr. Maxis' office upstairs, the catwalk with
  a box spot at its end, the teleporter alcove with an electric trap, and the trench/cave entrance.

Look: the static map is **light-baked per vertex** at load (`GameMap._bake`): every lamp, furnace and
teleporter registered with `M.light()` lights the zone it faces into, outdoor zones get moonlight, so rooms
are dark with warm pools under the lamps like the original. Walls/floors are subdivided to 1 m cells for
this; entities and the viewmodel use the normal dynamic lights. Textures are all procedural
(`js/20_textures.js`): grey ashlar stone and sooty brick, stained concrete, riveted steel and girders,
corrugated roofing with skylights, hexagonal panelling in the teleporter rooms, chain-link, catwalk
grating, lit/dark factory windows, sandbags. Props and structure (I-beams, trusses, facades, background
blocks, fences, cables, arches, shelving, steel/chain-link/debris/roller doors, curved teleporter arms,
the raised mainframe with its lattice towers) are in `js/45_props.js`.

Mechanics: Black Ops zombie count/health formulas (round 1–9 table, then `24 + 0.09·r²`; 150 HP +100/round to
round 9, then ×1.1), 24 alive cap, hellhound rounds every 4–5 rounds from round 5–7, 25 box weapons
(Ray Gun, Wunderwaffe DG-2 chain lightning, Monkey Bombs, Ballistic Knife…), Pack-a-Punch after linking all
three teleporters to the mainframe (activate a pad, run back within 30 s), teleport to the mainframe for 1500,
electric traps (1000, kill anything that crosses for 25 s, 60 s cooldown, hurt you too), all six power-ups,
Quick Revive solo self-revive, best round saved.

## Challenge design (for the author)

`js/05_vault.js`:

```
state  = sha256("DER_RIESE::MAINFRAME::115")
on every legitimate round advance to round r (r = 2..100):  state = sha256(state + ":" + r)
key    = sha256(state_at_round_100 + ":FLAG")
keystream block i = sha256(key + ":" + i)   (32 bytes each)
flag   = ciphertext XOR keystream ; accepted only if sha256(flag) == tag
```

`Game.advanceRound()` (in `90_game.js`) is the only code that calls `vault.advance()`. Setting
`game.round = 100`, or starting at round 99, produces the wrong chain state and the screen says
*MAINFRAME REJECTS DATA*. The ciphertext and tag live in `flag_data.js` (bundled into `dist/game.js`).
Everything is wrapped in an IIFE in the distributed build; there are no globals to poke at.

With authentic electric traps enabled (`TRAP_INSTAKILL` in `90_game.js`), round 100 is not strictly
impossible, just many hours of expert play; the chain still forces every round to be played. Flip the
constant to `false` to make traps damage-based.

### Intended solutions

1. **Breakpoint + loop**: open DevTools, find `advanceRound` in `game.js`, break inside `Game.update`, and in
   the console run `while (this.round < 100) this.advanceRound();`. The flag screen appears.
2. **Local Overrides / proxy edit**: edit `game.js` so `advanceRound` runs 99 times, or export the game object.
3. **Static recompute**: replicate the chain (see `tools/solve.py`) and decrypt `ZM.FLAG.ct` from the bundle:
   `python3 tools/solve.py dist/game.js`.

### Hardening options

* The build is readable on purpose; minify/obfuscate `dist/game.js` with any tool for more friction.
* Change the seed string in `js/05_vault.js` **and** `tools/gen_flag.py` / `tools/solve.py` for a new event.

## Tests

```
node tests/test_vault.js        # SHA-256 vectors, flag roundtrip vs Python, forgery rejection
node tests/test_map.js          # map + two-layer nav: zones, balconies, bridge, windows, doors, collision
python3 -m http.server 8123 --bind 127.0.0.1 &      # then:
node tests/browser.js           # headless Chromium smoke test (uses ~/.cache/ms-playwright chromium, no npm deps)
node tests/browser_full.js      # every system: doors, perks, power, bridge, traps, box, PaP, all weapons, dogs, pathing, QR, settings, vault
node tests/browser.js http://127.0.0.1:8123/dist/index.html    # distributed build: renders, no globals
node tests/scenic.js            # screenshots of every room (doors open, power on) into tests/shots_scenic/
```

Set `CHROME=/path/to/chrome` if Chromium lives elsewhere. `tests/shots*/` receive screenshots.

## Layout

```
index.html         dev page (individual sources + ZMDEV hooks)
js/                sources (load order in tools/build.py): core, vault, audio, textures, renderer, weapons,
                   props (machines & set dressing), map, nav, entities, player, game, hud, settings, main
flag_data.js       generated ciphertext/tag
tools/             gen_flag.py, build.py, solve.py
tests/             node + headless-browser tests, bench.html (browser frame-rate diagnostic)
dist/              deployable bundle (generated)
```

This is a fan project for a CTF; Call of Duty and Der Riese are trademarks of Activision. No game assets
are used — every texture, model and sound is procedurally generated.
