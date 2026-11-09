# Highrise Trickshot — solution writeup

**Goal:** land a trickshot worth **10,000,000,000 points**. The host (server) then hands over the flag.
**Category:** web / client-side game hacking.
**Intended solve:** change the game's physics settings (`CONFIG` in `game.js`) and then actually pull the trickshot off.

---

## 1. Recon

Open the game, then DevTools (F12).

**Sources → `game.js`.** Near the top is a settings object:

```js
const CONFIG = {
  GRAVITY: 20,
  JUMP_VELOCITY: 7,
  ...
  SWAP_COOLDOWN: 0.6,        // seconds between weapon swaps
  SWAP_TIME: 0.12,           // can't fire while swapping
  NOSCOPE_SPREAD: 1.5,       // degrees
  ...
  REQUIRED_SCORE: 10000000000,
};
```

**Network tab, one round of play.** Three API calls show up:

| Request | When | What it carries |
|---|---|---|
| `POST /api/session` | Round start | A one-time ticket + where the dummy is |
| `POST /api/takeoff` | The moment you leave the ground | The ticket, your `CONFIG`, your starting position/speed/weapon state |
| `POST /api/trickshot` | When you kill the dummy | The ticket + a frame-by-frame input log (mouse turn, keys, swaps, shots) |

**Menu → Multipliers.** All multipliers *multiply together*. Two of them have no upper limit:
- `× (1 + spins)` for every 360 done mid-air
- `× (1 + 0.5 × swaps)` for every weapon swap done mid-air

## 2. What doesn't work (and why)

- **Editing the score or `REQUIRED_SCORE`.** The client never sends a score. The server re-simulates your jump from the input log and computes every multiplier itself.
- **Replaying `/api/trickshot`.** Each ticket is single-use: *"killcam ticket already used or expired."*
- **Editing the captured `/api/trickshot` packet**, e.g. adding turns to the log. Your settings were already committed in `/api/takeoff`, so extra turns get clamped/rejected. Fake shots are re-checked against the server's own dummy. The killcam length must also match the real time between takeoff and the request.
- **Changing `CONFIG` from the console.** `game.js` is an ES module, so `CONFIG` isn't reachable from `window`.
- **Just playing really well.** With the stock settings you get about 0.7 s of airtime and one weapon swap per 0.6 s. Spinning as fast as the game accepts (testing below: 840 × 360 in one jump) still only gives about **1.2 million** points.

## 3. The bug

`/api/takeoff` sends your `CONFIG`, and the server **replays your trick using whatever settings you sent** (within very loose ranges). Changing the physics in the client therefore changes what the server considers possible.

The score grows roughly with airtime² × swaps, so the levers are:

| Setting | Change | Why |
|---|---|---|
| `GRAVITY` | `20` → `2` | ~7 s of airtime instead of 0.7 s, so far more spins and the airtime multiplier goes up |
| `SWAP_COOLDOWN` | `0.6` → `0` | Swap weapons every frame: hundreds of swaps, each one adds ×0.5 |
| `SWAP_TIME` | `0.12` → `0` | Fire immediately after a swap (also earns *Canswap ×1.5*) |
| `NOSCOPE_SPREAD` | `1.5` → `0` | Noscopes go exactly where you aim (×3) |

## 4. Steps

1. **(Optional) Get the Aimbot perk.** Menu → *Perk shop* → redeem code `MOMGETTHECAMERA` (+1,000 coins) → buy **Aimbot**. It locks onto the dummy when you fire, so the shot is trivial. Without it, `NOSCOPE_SPREAD: 0` makes manual aiming easy.
2. **Override `game.js`** (Chrome/Edge):
   1. DevTools → **Sources** → **Overrides** tab → **Select folder for overrides** → allow access.
   2. In the **Page** tab, open `game.js`, right-click → **Override content**.
   3. Edit the four `CONFIG` values from the table above, then **Ctrl+S**.
   4. Reload the page. The override is now served instead of the real file.
   - **Firefox:** there are no built-in overrides, so rewrite the response with Burp/mitmproxy/a local proxy, or save the site locally and serve it.
3. **Get within range of the dummy.** It spawns on the east end of the helipad deck, under a bobbing red marker. Go up either switchback staircase at the deck's west end.
4. **Jump.** With `GRAVITY: 2` you hang in the air for about 7 seconds.
   - Spin the mouse as hard as you can. Turn sensitivity up in Settings, it goes to 100, and there's no turn-rate cap.
   - Spam the scroll wheel (or Q) to swap weapons.
   - Watch the HUD: *360s* and *Swaps* climb.
5. **Before you land**, make sure you're holding the **Intervention** (bottom right of the HUD), point at the dummy and fire (or just fire, with Aimbot).
6. **Collect the flag.** The killcam plays, then the round-over screen shows the score and the flag:

```
CTF{1_ju5t_h1t_4_m1ll10n_p01nt_tr1ck5h0t_0n_h1ghr1s3}
```

(The flag is set by the `FLAG` environment variable, so a deployment may use a different one.)

## 5. Test run

Automated in headless Chromium against the running container. Only the four `CONFIG` values were edited (the same edit as step 2). All inputs went through the real controls: keyboard jump, mouse movement for spinning, scroll wheel for swaps, mouse click to fire with the Aimbot perk. The only test shortcuts were skipping the pointer-lock click and teleporting onto the deck.

| Run | Settings | Result |
|---|---|---|
| A | Stock `game.js`, max-speed spinning, Aimbot | **1,189,464 pts** — no flag. Distance ×1.36 · 840× 360 ×841 · No scope ×3 · Mid-air ×2 · Airtime 0.7 s ×1.33 · Flick ×1.3 |
| B | `GRAVITY 2`, `SWAP_COOLDOWN 0`, `SWAP_TIME 0`, `NOSCOPE_SPREAD 0` | **23,129,952,545 pts** — **flag returned.** Distance ×1.35 · 10,959× 360 ×10,960 · 626× Weapon swap ×314 · Canswap ×1.5 · No scope ×3 · Mid-air ×2 · Airtime 6.5 s ×4.26 · Flick ×1.3 |

## 6. Notes for organizers

- The anti-cheat is intentionally only "as strong as the settings you commit". The lesson is that the server trusts client-supplied physics.
- **Other valid solves:**
  - A lower `GRAVITY` alone plus lots of spinning gets close.
  - Raising `JUMP_VELOCITY` also buys airtime.
  - Knife kills (×5 + 1 per wall bounce) can replace the noscope multiplier.
  - Writing your own client that speaks the session → takeoff → trickshot protocol in real time also works. It's more effort but legitimate.
- **Raising the bar:** tighten `CONFIG_RANGES` in `app.py`, or increase `REQUIRED_SCORE`.
