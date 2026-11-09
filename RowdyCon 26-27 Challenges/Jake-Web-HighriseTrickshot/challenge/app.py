import json
import math
import os
import random
import secrets
import threading
import time

from flask import Flask, jsonify, request, send_from_directory

app = Flask(__name__, static_folder="static", static_url_path="")
app.config["MAX_CONTENT_LENGTH"] = 8 * 1024 * 1024

FLAG = os.environ.get("FLAG", "CTF{1_ju5t_h1t_4_m1ll10n_p01nt_tr1ck5h0t_0n_h1ghr1s3}")
REQUIRED_SCORE = 10_000_000_000
SESSION_TTL = 15 * 60
EYE = 1.65
KILL_PLANE = -60

# Map collision boxes, exported from static/map.js at build time (tools/export_map.mjs).
with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "colliders.json")) as f:
    COLLIDERS = json.load(f)
KNIFE_STEP, KNIFE_MAX_TIME, KNIFE_MAX_BOUNCES, KNIFE_MIN_SPEED = 1 / 120, 4, float("inf"), 1.5   # no bounce cap

# One-time killcam tickets: nonce -> {"bot": {...}, "exp": t}. Single worker (see Dockerfile).
sessions = {}
lock = threading.Lock()

# Settings the client plays with. Players may change these; the server replays with them.
CONFIG_RANGES = {
    "GRAVITY": (1e-3, 1e4),
    "JUMP_VELOCITY": (0, 1e4),
    "MOVE_SPEED": (0, 1e4),
    "SPRINT_SPEED": (0, 1e4),
    "MAX_TURN_RATE": (0, 1e7),
    "SWAP_COOLDOWN": (0, 60),
    "SWAP_TIME": (0, 60),
    "ADS_TIME": (1e-3, 60),
    "QUICKSCOPE_WINDOW": (0, 60),
    "NOSCOPE_SPREAD": (0, 45),
    "SNIPER_FIRE_DELAY": (0, 60),
    "PISTOL_FIRE_DELAY": (0, 60),
    "KNIFE_SPEED": (1e-3, 1e4),
    "KNIFE_GRAVITY": (0, 1e4),
    "KNIFE_BOUNCE": (0, 1),
}


# ---------- Coins + perks ----------
# Each perk nudges one CONFIG value a little. Small on purpose: even with every perk a legit
# trickshot stays far below REQUIRED_SCORE. The names hint at what to change yourself.
PERK_MAX_TIER = 5
PERKS = {   # effect per tier is multiplied in (tier 3 = mult ** 3); price doubles every tier
    "low_grav":   {"name": "Low Gravity",  "cost": 40, "key": "GRAVITY",        "mult": 0.9},
    "spring":     {"name": "Spring Boots", "cost": 50, "key": "JUMP_VELOCITY",  "mult": 1.05},
    "fast_hands": {"name": "Fast Hands",   "cost": 30, "key": "SWAP_COOLDOWN",  "mult": 0.9},
    "quick_draw": {"name": "Quick Draw",   "cost": 30, "key": "ADS_TIME",       "mult": 0.9},
    "steady":     {"name": "Steady Aim",   "cost": 25, "key": "NOSCOPE_SPREAD", "mult": 0.85},
    "rubber":     {"name": "Rubber Knife", "cost": 40, "key": "KNIFE_BOUNCE",   "mult": 1.06},
    "aimbot":     {"name": "Aimbot", "cost": 1000, "key": None, "mult": 1, "max": 1,
                   "desc": "Locks onto the dummy before you shoot, and angles throwing knives to land on it"},
}
CAMOS = {   # cosmetic weapon camos (patterns are drawn by the game)
    "desert":     {"name": "Desert",     "cost": 40},
    "arctic":     {"name": "Arctic",     "cost": 40},
    "woodland":   {"name": "Woodland",   "cost": 60},
    "digital":    {"name": "Digital",    "cost": 80},
    "urban":      {"name": "Urban",      "cost": 80},
    "fall":       {"name": "Fall",       "cost": 100},
    "red_tiger":  {"name": "Red Tiger",  "cost": 200},
    "blue_tiger": {"name": "Blue Tiger", "cost": 200},
    "gold":       {"name": "Gold",       "cost": 1000},
}
# Redeem codes for coins, set with REDEEM_CODES="CODE:amount,CODE:amount" (case-insensitive).
def parse_codes(raw):
    codes = {}
    for item in (raw or "").split(","):
        name, _, amount = item.strip().partition(":")
        if name and amount.strip().isdigit():
            codes[name.strip().upper()] = int(amount)
    return codes


REDEEM_CODES = parse_codes(os.environ.get("REDEEM_CODES", "MLG:200,NOSCOPE:100,QUICKSCOPE:150,HIGHRISE:250,MOMGETTHECAMERA:1000"))
WALLET_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "wallets.json")
try:
    with open(WALLET_FILE) as f:
        wallets = json.load(f)
except (OSError, ValueError):
    wallets = {}


def wallet(pid):
    if not isinstance(pid, str) or len(pid) != 32 or any(c not in "0123456789abcdef" for c in pid):
        return None
    w = wallets.setdefault(pid, {"coins": 0, "perks": {}})
    if isinstance(w["perks"], list):            # old format: list of owned perk ids
        w["perks"] = {k: 1 for k in w["perks"]}
    w.setdefault("camos", [])
    w.setdefault("redeemed", [])
    w.setdefault("camo", None)
    return w


def perk_price(perk, tier):
    return perk["cost"] * 2 ** tier


def save_wallets():
    try:
        tmp = WALLET_FILE + ".tmp"
        with open(tmp, "w") as f:
            json.dump(wallets, f)
        os.replace(tmp, WALLET_FILE)
    except OSError:
        pass


class Reject(Exception):
    pass


def num(v, lo=-1e9, hi=1e9):
    if isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) or not lo <= v <= hi:
        raise Reject("Anti-cheat: malformed killcam.")
    return float(v)


def clamp(v, lo, hi):
    return max(lo, min(hi, v))


# ---------- ray tests against the dummy (box body + sphere head) ----------
def ray_box(o, d, bot, tmax_in=800.0):
    c, s = math.cos(bot["rot"]), math.sin(bot["rot"])
    rx, ry, rz = o[0] - bot["x"], o[1] - (bot["y"] + 0.725), o[2] - bot["z"]
    lo = (rx * c - rz * s, ry, rx * s + rz * c)
    ld = (d[0] * c - d[2] * s, d[1], d[0] * s + d[2] * c)
    half = (0.45, 0.725, 0.25)
    tmin, tmax = 0.0, tmax_in
    for i in range(3):
        if abs(ld[i]) < 1e-12:
            if abs(lo[i]) > half[i]:
                return None
            continue
        t1, t2 = (-half[i] - lo[i]) / ld[i], (half[i] - lo[i]) / ld[i]
        tmin, tmax = max(tmin, min(t1, t2)), min(tmax, max(t1, t2))
        if tmin > tmax:
            return None
    return tmin


def ray_sphere(o, d, bot, tmax=800.0):
    cx, cy, cz, r = bot["x"], bot["y"] + 1.72, bot["z"], 0.25
    ox, oy, oz = o[0] - cx, o[1] - cy, o[2] - cz
    b = ox * d[0] + oy * d[1] + oz * d[2]
    c = ox * ox + oy * oy + oz * oz - r * r
    disc = b * b - c
    if disc < 0:
        return None
    t = -b - math.sqrt(disc)
    return t if 0 <= t <= tmax else None


def ray_bot_t(o, d, bot, tmax=800.0):
    tb, th = ray_box(o, d, bot, tmax), ray_sphere(o, d, bot, tmax)
    if th is not None and (tb is None or th <= tb):
        return "head", th
    return ("body", tb) if tb is not None else (None, None)


def ray_bot(o, d, bot):
    return ray_bot_t(o, d, bot)[0]


def simulate_knife(o, d, speed, gravity, bounce, bot):
    """Exact copy of simulateKnife() in static/map.js."""
    h = KNIFE_STEP
    p = [o[0], o[1], o[2]]
    v = [d[0] * speed, d[1] * speed, d[2] * speed]
    bounces = wall_hits = 0
    travel = 0.0
    for _ in range(int(KNIFE_MAX_TIME // h)):
        v[1] -= gravity * h
        q = [p[0] + v[0] * h, p[1] + v[1] * h, p[2] + v[2] * h]
        sx, sy, sz = q[0] - p[0], q[1] - p[1], q[2] - p[2]
        L = math.sqrt(sx * sx + sy * sy + sz * sz)
        if L > 0:
            part, th = ray_bot_t(p, (sx / L, sy / L, sz / L), bot, L)
            if part:
                return part, wall_hits, travel + th
        box = None
        for b in COLLIDERS:
            if b[0] < q[0] < b[3] and b[1] < q[1] < b[4] and b[2] < q[2] < b[5]:
                box = b
                break
        if box:
            hit_any = hit_wall = False
            for a in range(3):
                if p[a] <= box[a] or p[a] >= box[a + 3]:
                    v[a] = -v[a] * bounce
                    hit_any = True
                    if a != 1:
                        hit_wall = True
            if not hit_any:
                break
            bounces += 1
            if hit_wall:
                wall_hits += 1
            if bounces > KNIFE_MAX_BOUNCES:
                break
        else:
            p = q
            travel += L
        if p[1] < -60 or math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) < KNIFE_MIN_SPEED:
            break
    return None, wall_hits, travel


def aim_dir(yaw, pitch, spread, r1, ang):
    cp = math.cos(pitch)
    d = [-math.sin(yaw) * cp, math.sin(pitch), -math.cos(yaw) * cp]
    if spread > 0:
        rx, rz = -d[2], d[0]                         # cross(dir, up), y = 0
        rl = math.hypot(rx, rz)
        rx, rz = rx / rl, rz / rl
        ux, uy, uz = -rz * d[1], rz * d[0] - rx * d[2], rx * d[1]   # cross(right, dir)
        s = math.tan(math.radians(spread)) * r1
        d = [d[0] + rx * math.cos(ang) * s + ux * math.sin(ang) * s,
             d[1] + uy * math.sin(ang) * s,
             d[2] + rz * math.cos(ang) * s + uz * math.sin(ang) * s]
        l = math.sqrt(d[0] ** 2 + d[1] ** 2 + d[2] ** 2)
        d = [d[0] / l, d[1] / l, d[2] / l]
    return d


# ---------- killcam replay ----------
def check_takeoff(cfg_in, to):
    """Validate the settings + takeoff state the client commits when it leaves the ground."""
    if not isinstance(cfg_in, dict) or not isinstance(to, dict):
        raise Reject("Anti-cheat: malformed takeoff.")
    cfg = {k: num(cfg_in.get(k), lo, hi) for k, (lo, hi) in CONFIG_RANGES.items()}
    replay(cfg, to, None, None, None)   # runs the takeoff checks only
    return cfg


def replay(cfg, to, frames, end, bot):
    if frames is not None and (not isinstance(frames, list) or not 1 <= len(frames) <= 300_000):
        raise Reject("Anti-cheat: malformed killcam.")
    px, py, pz = (num(v) for v in to.get("pos", [None] * 3)[:3])
    vx, vy, vz = (num(v) for v in to.get("vel", [None] * 3)[:3])
    yaw, pitch = num(to.get("yaw"), -1e7, 1e7), num(to.get("pitch"), -1.55, 1.55)
    sprint_jump = to.get("sprint") is True
    w = to.get("weapon")
    if not isinstance(w, dict) or w.get("current") not in ("sniper", "pistol"):
        raise Reject("Anti-cheat: malformed killcam.")
    cur = w["current"]
    last_swap = num(w.get("lastSwap"), -1e9, 0)
    swap_end = num(w.get("swapEnd"), -1e9, cfg["SWAP_TIME"])
    last_shot = num(w.get("lastShot"), -1e9, 0)
    ads_press = num(w.get("adsPress"), -1e9, 0)
    ads = num(w.get("ads"), 0, 1)
    ads_held = w.get("adsHeld") is True

    # Takeoff has to be somewhere on the map, at a speed the settings allow.
    if not (-100 <= px <= 40 and -65 <= pz <= 65 and -5 <= py <= 18):
        raise Reject("Anti-cheat: you took off from outside the map.")
    if math.hypot(vx, vz) > cfg["SPRINT_SPEED"] + 0.01 or not -cfg["GRAVITY"] * 0.1 <= vy <= max(cfg["JUMP_VELOCITY"], 4.5) + 0.01:
        raise Reject("Anti-cheat: impossible takeoff speed.")
    takeoff_y = py
    takeoff_xz = (px, pz)
    crane = py >= 12 or (px < -35.2 and pz > -40.5)  # tower-crane jib, or the sloped crane arms off the west edge
    perch = 5 <= py < 12             # catwalks, ledges, sign, office roofs
    if frames is None:
        return None

    t = 0.0
    run_dir, run_amt, spins, dirs = 0, 0.0, 0, set()
    swaps, last_air_swap, scope_ins, tags = 0, None, 0, 0
    turns = []
    kill = None
    knife_used = False

    def close_run():
        nonlocal run_amt, spins
        n = int(run_amt // (2 * math.pi))
        if n > 0:
            spins += n
            dirs.add(run_dir)
        run_amt = 0.0

    for i, fr in enumerate(frames):
        last = i == len(frames) - 1
        if not isinstance(fr, list) or len(fr) < 2 or not isinstance(fr[1], list):
            raise Reject("Anti-cheat: malformed killcam.")
        dt = num(fr[0], 1e-6, 0.05 + 1e-9)
        t += dt
        if t > 600:
            raise Reject("Anti-cheat: killcam too long.")

        for ev in fr[1]:
            if kill:
                raise Reject("Anti-cheat: inputs after the kill.")
            if ev == "s":
                if t - last_swap >= cfg["SWAP_COOLDOWN"]:
                    last_swap, swap_end = t, t + cfg["SWAP_TIME"]
                    cur = "pistol" if cur == "sniper" else "sniper"
                    ads = 0.0
                    swaps += 1
                    last_air_swap = t
            elif ev == "d":
                if cur == "sniper":
                    ads_held, ads_press = True, t
            elif ev == "u":
                ads_held = False
            elif ev == "k":
                if knife_used:
                    continue
                knife_used = True
                origin = (px, py + EYE, pz)
                part, wall_hits, travel = simulate_knife(origin, aim_dir(yaw, pitch, 0, 0, 0), cfg["KNIFE_SPEED"],
                                                 cfg["KNIFE_GRAVITY"], cfg["KNIFE_BOUNCE"], bot)
                if part:
                    kill = {"t": t, "scope": None, "weapon": "knife", "walls": wall_hits, "travel": travel,
                            "head": part == "head", "origin": origin}
            elif isinstance(ev, list) and len(ev) == 3 and ev[0] == "f":
                r1, ang = num(ev[1], 0, 1), num(ev[2], 0, 2 * math.pi + 1e-9)
                if t < swap_end:
                    continue
                sniper = cur == "sniper"
                if t - last_shot < (cfg["SNIPER_FIRE_DELAY"] if sniper else cfg["PISTOL_FIRE_DELAY"]):
                    continue
                last_shot = t
                scope, spread = "noscope", cfg["NOSCOPE_SPREAD"]
                if sniper and ads_held and ads >= 1:
                    spread = 0
                    scope = "quickscope" if t - ads_press <= cfg["QUICKSCOPE_WINDOW"] else "hardscope"
                elif not sniper:
                    spread = 0.4
                origin = (px, py + EYE, pz)
                hit = ray_bot(origin, aim_dir(yaw, pitch, spread, r1, ang), bot)
                if sniper:
                    ads_held, ads = False, 0.0
                if hit:
                    if sniper:
                        kill = {"t": t, "scope": scope, "weapon": "sniper", "head": hit == "head", "origin": origin}
                    else:
                        tags += 1
            else:
                raise Reject("Anti-cheat: malformed killcam.")

        if kill:
            if not last:
                raise Reject("Anti-cheat: frames after the kill.")
            break
        if last:
            break
        if len(fr) != 5:
            raise Reject("Anti-cheat: malformed killcam.")
        raw, new_pitch = num(fr[2]), num(fr[3], -1.55 - 1e-9, 1.55 + 1e-9)
        mask = fr[4]
        if not isinstance(mask, int) or isinstance(mask, bool) or not 0 <= mask <= 31:
            raise Reject("Anti-cheat: malformed killcam.")

        # Look (turn rate capped by MAX_TURN_RATE)
        max_turn = math.radians(cfg["MAX_TURN_RATE"]) * dt
        d_yaw = clamp(raw, -max_turn, max_turn)
        yaw += d_yaw
        if d_yaw:
            sgn = 1 if d_yaw > 0 else -1
            if sgn != run_dir:
                close_run()
                run_dir = sgn
            run_amt += abs(d_yaw)
        turns.append((t, abs(d_yaw)))
        pitch = new_pitch

        # Air movement + gravity
        fwd = (1 if mask & 1 else 0) - (1 if mask & 2 else 0)
        strafe = (1 if mask & 8 else 0) - (1 if mask & 4 else 0)
        speed = cfg["SPRINT_SPEED"] if mask & 16 else cfg["MOVE_SPEED"]
        wx = -math.sin(yaw) * fwd + math.cos(yaw) * strafe
        wz = -math.cos(yaw) * fwd - math.sin(yaw) * strafe
        wl = math.sqrt(wx * wx + wz * wz)
        if wl > 0:
            wx, wz = wx / wl * speed, wz / wl * speed
            k = 1 - math.exp(-1.5 * dt)
            vx += (wx - vx) * k
            vz += (wz - vz) * k
        vy -= cfg["GRAVITY"] * dt
        px += vx * dt
        pz += vz * dt
        py += vy * dt
        if py < KILL_PLANE:
            raise Reject("You hit the ground before the shot.")

        # Scope-in progress
        can_ads = ads_held and cur == "sniper" and t >= swap_end
        prev = ads
        ads = clamp(ads + (dt if can_ads else -2 * dt) / cfg["ADS_TIME"], 0, 1)
        if prev < 1 and ads >= 1:
            scope_ins += 1

    if not kill:
        raise Reject("Anti-cheat: the killcam doesn't show a kill.")
    if not isinstance(end, list) or len(end) != 3 or math.dist([num(v) for v in end], (px, py, pz)) > 2:
        raise Reject("Killcam desync (did you bump into something mid-air?). Try again.")
    close_run()

    # ---------- multipliers ----------
    o = kill["origin"]
    dist = math.dist(o, (bot["x"], bot["y"] + 0.9, bot["z"]))
    flick = sum(a for (tt, a) in turns if tt > kill["t"] - 0.15) >= math.pi / 2
    m = [(f"Distance {round(dist)}m", 1 + dist / 25)]
    if spins:
        m.append((f"{spins}× 360", 1 + spins))
    if len(dirs) == 2:
        m.append(("Reverse 360", 1.5))
    if swaps:
        m.append((f"{swaps}× Weapon swap", swaps))
    if last_air_swap is not None and kill["t"] - last_air_swap <= 0.5:
        m.append(("Canswap", 1.5))
    if kill["weapon"] == "knife":
        walls = kill["walls"]
        m.append(("Throwing knife", 5))
        if walls:
            m.append((f"{walls}× Wall bounce", walls))
        m.append((f"Long throw {round(kill['travel'])}m", 1 + kill["travel"] / 50))
    else:
        m.append({"noscope": ("No scope", 3), "quickscope": ("Quick scope", 2), "hardscope": ("Hard scope", 0.5)}[kill["scope"]])
    if scope_ins:
        m.append((f"{scope_ins}× Scope-in", scope_ins))
    if tags:
        m.append((f"{tags}× Deagle tag", 1 + 3 * tags))
    m.append(("Mid-air", 2))
    air_travel = math.hypot(o[0] - takeoff_xz[0], o[2] - takeoff_xz[1])
    if air_travel >= 1:
        m.append((f"Air travel {round(air_travel)}m", 1 + air_travel / 30))
    m.append((f"Airtime {kill['t']:.1f}s", 1 + 0.5 * kill["t"]))
    if kill["head"]:
        m.append(("Headshot", 1.5))
    if crane:
        m.append(("Off the crane", 1.5))
    elif perch:
        m.append(("High perch", 1.2))
    if sprint_jump and math.hypot(*[float(v) for v in (to["vel"][0], to["vel"][2])]) > cfg["MOVE_SPEED"] + 0.5:
        m.append(("Sprint jump", 1.2))
    if o[1] - EYE < takeoff_y - 4:
        m.append(("Kamikaze drop", 1.5))
    if flick:
        m.append(("Flick", 1.3))

    score = 100.0
    for _, mult in m:
        score *= mult
    return {"score": math.floor(score), "breakdown": m, "spins": spins, "scope": kill["scope"],
            "headshot": kill["head"], "airtime": kill["t"], "weapon": kill["weapon"]}


@app.get("/")
def index():
    return send_from_directory("static", "index.html")


@app.post("/api/session")
def new_session():
    now = time.time()
    nonce = secrets.token_hex(16)
    bot = {"x": random.uniform(24, 31), "y": 3.56, "z": random.choice((-1, 1)) * random.uniform(3.8, 8.5),
           "rot": random.uniform(0, 2 * math.pi)}  # east end of the helipad deck (BOT_AREA in map.js)
    with lock:
        for k in [k for k, v in sessions.items() if v["exp"] < now]:
            del sessions[k]
        if len(sessions) > 20_000:
            sessions.clear()
        sessions[nonce] = {"bot": bot, "exp": now + SESSION_TTL, "jumps": {}}
    return jsonify(nonce=nonce, bot=bot)


@app.post("/api/takeoff")
def takeoff():
    """Sent the moment you leave the ground: locks in your settings and starting state."""
    d = request.get_json(silent=True) or {}
    jump = d.get("jump")
    if not isinstance(jump, int) or isinstance(jump, bool):
        return jsonify(ok=False), 400
    try:
        cfg = check_takeoff(d.get("config"), d.get("takeoff"))
    except Reject as e:
        return jsonify(ok=False, message=str(e)), 400
    with lock:
        s = sessions.get(d.get("nonce")) if isinstance(d.get("nonce"), str) else None
        if not s:
            return jsonify(ok=False, message="Unknown ticket."), 400
        s["jumps"][jump] = {"cfg": cfg, "takeoff": d["takeoff"], "time": time.time()}
        for k in sorted(s["jumps"])[:-8]:
            del s["jumps"][k]
    return jsonify(ok=True)


@app.post("/api/trickshot")
def trickshot():
    d = request.get_json(silent=True) or {}
    with lock:
        s = sessions.pop(d.get("nonce"), None) if isinstance(d.get("nonce"), str) else None
    if not s or s["exp"] < time.time():
        return jsonify(ok=False, message="Anti-cheat: killcam ticket already used or expired."), 400
    rec = s["jumps"].get(d.get("jump"))
    if not rec:
        return jsonify(ok=False, message="Anti-cheat: no takeoff on record for this killcam."), 400
    try:
        r = replay(rec["cfg"], rec["takeoff"], d.get("frames"), d.get("end"), s["bot"])
    except Reject as e:
        return jsonify(ok=False, message=str(e)), 400
    # The killcam has to fit the real time between takeoff and this request.
    #  - It can't be longer than real time (that would be faking a longer trick). 2 s of slack covers
    #    a slow network: the takeoff request may reach us late.
    #  - It can be a lot shorter: the game clock only advances up to 0.05 s per frame, so on a slow
    #    computer (low FPS) game time runs slower than real time. Allow down to ~5 FPS (25% of real
    #    time) plus 5 s for network/server delays.
    wall = time.time() - rec["time"]
    if r["airtime"] > wall + 2.0:
        return jsonify(ok=False, message="Anti-cheat: killcam is longer than real time."), 400
    if r["airtime"] < wall * 0.25 - 5:
        return jsonify(ok=False, message="Anti-cheat: killcam arrived too late (or the game ran below ~5 FPS)."), 400

    r["ok"] = True
    with lock:
        w = wallet(d.get("player"))
        if w is not None:
            r["coins_earned"] = min(50, 10 + r["score"] // 2500)
            w["coins"] += r["coins_earned"]
            r["coins"] = w["coins"]
            save_wallets()
    if r["score"] >= REQUIRED_SCORE:
        r["flag"] = FLAG
    else:
        r["message"] = f"{r['score']:,} pts. You need {REQUIRED_SCORE:,} for the flag. Stay MLG."
    return jsonify(r)


@app.get("/api/wallet")
def get_wallet():
    with lock:
        w = wallet(request.args.get("player"))
        if w is None:
            return jsonify(ok=False), 400
        return jsonify(ok=True, coins=w["coins"], perks=w["perks"], catalog=PERKS, max_tier=PERK_MAX_TIER,
                       camos=w["camos"], camo=w["camo"], camo_catalog=CAMOS)


@app.post("/api/shop")
def buy_perk():
    d = request.get_json(silent=True) or {}
    perk = PERKS.get(d.get("perk")) if isinstance(d.get("perk"), str) else None
    with lock:
        w = wallet(d.get("player"))
        if w is None or perk is None:
            return jsonify(ok=False, message="Unknown perk."), 400
        tier = w["perks"].get(d["perk"], 0)
        if tier >= perk.get("max", PERK_MAX_TIER):
            return jsonify(ok=False, message="Already maxed."), 400
        price = perk_price(perk, tier)
        if w["coins"] < price:
            return jsonify(ok=False, message="Not enough coins."), 400
        w["coins"] -= price
        w["perks"][d["perk"]] = tier + 1
        save_wallets()
        return jsonify(ok=True, coins=w["coins"], perks=w["perks"])


@app.post("/api/camo")
def camo():
    d = request.get_json(silent=True) or {}
    cid, action = d.get("camo"), d.get("action")
    with lock:
        w = wallet(d.get("player"))
        if w is None or (cid is not None and cid not in CAMOS) or action not in ("buy", "equip"):
            return jsonify(ok=False, message="Unknown camo."), 400
        if action == "buy":
            if cid in w["camos"]:
                return jsonify(ok=False, message="Already owned."), 400
            if w["coins"] < CAMOS[cid]["cost"]:
                return jsonify(ok=False, message="Not enough coins."), 400
            w["coins"] -= CAMOS[cid]["cost"]
            w["camos"].append(cid)
            w["camo"] = cid
        else:
            if cid is not None and cid not in w["camos"]:
                return jsonify(ok=False, message="You don't own that camo."), 400
            w["camo"] = cid
        save_wallets()
        return jsonify(ok=True, coins=w["coins"], camos=w["camos"], camo=w["camo"])


@app.post("/api/redeem")
def redeem():
    d = request.get_json(silent=True) or {}
    code = d.get("code").strip().upper() if isinstance(d.get("code"), str) else ""
    with lock:
        w = wallet(d.get("player"))
        if w is None or code not in REDEEM_CODES:
            return jsonify(ok=False, message="Invalid code."), 400
        if code in w["redeemed"]:
            return jsonify(ok=False, message="You already redeemed that code."), 400
        w["redeemed"].append(code)
        w["coins"] += REDEEM_CODES[code]
        save_wallets()
        return jsonify(ok=True, amount=REDEEM_CODES[code], coins=w["coins"])


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8080)
