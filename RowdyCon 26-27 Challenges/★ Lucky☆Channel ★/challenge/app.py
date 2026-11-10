"""
Lucky(TM) Channel -- Konata's Otaku Densetsu HQ
================================================
A (deliberately vulnerable) early/mid-2000s anime fan portal.

This is a CTF target. There are TWO intended bugs that must be CHAINED:

  Stage 1 -- JWT RS256 -> HS256 key-confusion auth bypass.
             Session tokens are signed RS256 with a private key, but the
             /backstage verifier passes the *public key PEM as a string* and
             accepts HS256 as well. That lets a player HMAC-sign a forged
             "role":"admin" token using the public key (which is published).

  Stage 2 -- Jinja2 SSTI behind a keyword blacklist, in the admin-only
             "Lucky Channel broadcast" preview. The blacklist kills the usual
             os/subprocess/config/request payloads, so the intended solve
             reaches the builtins via a Jinja global and just open()s the flag.

Flag lives at /flag.txt inside the container.
"""
import os
import time
import json
import hmac
import hashlib
import base64
import jwt
from flask import (
    Flask, request, render_template, render_template_string,
    redirect, url_for, make_response, Response, abort,
)

HERE = os.path.dirname(os.path.abspath(__file__))
app = Flask(__name__)

with open(os.path.join(HERE, "private.pem"), "r") as f:
    PRIVATE_KEY = f.read()
with open(os.path.join(HERE, "public.pem"), "r") as f:
    PUBLIC_KEY = f.read()          # <-- handed to jwt.decode() as a *string*

# ---------------------------------------------------------------------------
# dumb in-memory "database" -- resets on restart, totally fine for a CTF
# ---------------------------------------------------------------------------
USERS = {"konata": "haruhi"}       # a seeded non-admin account for flavour
GUESTBOOK = [
    {"name": "kagamin", "msg": "konata stop playing games and do your homework!!"},
    {"name": "tsukasa", "msg": "onee-chan is so mean >_< ... anyway hi everyone~"},
    {"name": "miyuki",  "msg": "Did you know? The star festival is called Tanabata."},
]
VISITS = 131337


IMG_EXTS = ("png", "jpg", "jpeg", "gif", "webp")
CHARAS = ("konata", "kagami", "tsukasa", "miyuki")

# Configured portrait URLs (operator-supplied). A matching file dropped in
# static/media/ (e.g. konata.png) still overrides these.
CHARA_URLS = {
    "konata":  "https://i.pinimg.com/736x/0d/f4/be/0df4be5c60be88f45922e9992beaeee3.jpg",
    "kagami":  "https://i.pinimg.com/474x/da/24/f0/da24f02eb2d402b9231bf6b6e1a7b239.jpg",
    "tsukasa": "https://i.pinimg.com/474x/09/45/1b/09451b66b90185d2c80f5403fa81f3e2.jpg",
    "miyuki":  "https://i.pinimg.com/736x/bf/8c/76/bf8c7679eba165c06d032e1a853c137e.jpg",
}


@app.context_processor
def inject_media():
    """Expose operator-dropped files in static/media/ to every page.

    - fan_media:  everything, for the Fan Media Wall
    - chara_imgs: per-character portrait override. Drop a file named
                  konata.* / kagami.* / tsukasa.* / miyuki.* into static/media/
                  and it replaces the default homage chibi in the sidebar.
    """
    media_dir = os.path.join(HERE, "static", "media")
    items = []
    overrides = {}
    if os.path.isdir(media_dir):
        for fn in sorted(os.listdir(media_dir)):
            if "." not in fn:
                continue
            base, ext = fn.rsplit(".", 1)
            ext = ext.lower()
            if ext in IMG_EXTS:
                items.append(("img", fn))
                if base.lower() in CHARAS:
                    overrides[base.lower()] = "media/" + fn
            elif ext in ("mp4", "webm", "ogg"):
                items.append(("video", fn))
    # a character's wall image shouldn't also clutter the Fan Media Wall
    override_files = set(overrides.values())
    items = [(k, f) for (k, f) in items if ("media/" + f) not in override_files]

    def chara_src(c):
        if c in overrides:                       # local drop-in wins
            return url_for("static", filename=overrides[c])
        if CHARA_URLS.get(c):                     # then configured URL
            return CHARA_URLS[c]
        return url_for("static", filename="img/%s.png" % c)  # fallback homage art

    chara_imgs = {c: chara_src(c) for c in CHARAS}
    return {"fan_media": items, "chara_imgs": chara_imgs}


def issue_token(username, role="user"):
    payload = {"user": username, "role": role, "iat": int(time.time())}
    return jwt.encode(payload, PRIVATE_KEY, algorithm="RS256")


def current_user():
    """Return the token payload, or None. NON-admin path: strict RS256 only."""
    tok = request.cookies.get("lucky_token")
    if not tok:
        return None
    try:
        return jwt.decode(tok, PUBLIC_KEY, algorithms=["RS256"])
    except Exception:
        return None


def _b64url_decode(seg):
    seg = seg + "=" * (-len(seg) % 4)
    return base64.urlsafe_b64decode(seg.encode())


def decode_backstage(token):
    """The 'legacy intern build' token verifier used ONLY by /backstage.

    RS256 is verified correctly. But an HS256 fallback was bolted on back in
    the 2003 build, and it HMACs with the (public!) signing key as the secret.
    Since the public key is published, anyone can mint a valid HS256 token.
    """
    parts = token.split(".")
    if len(parts) != 3:
        raise ValueError("malformed token")
    header = json.loads(_b64url_decode(parts[0]))
    alg = header.get("alg")
    signing_input = (parts[0] + "." + parts[1]).encode()

    if alg == "RS256":
        return jwt.decode(token, PUBLIC_KEY, algorithms=["RS256"])

    if alg == "HS256":
        expected = base64.urlsafe_b64encode(
            hmac.new(PUBLIC_KEY.encode(), signing_input, hashlib.sha256).digest()
        ).rstrip(b"=").decode()
        if hmac.compare_digest(expected, parts[2]):
            return json.loads(_b64url_decode(parts[1]))
        raise ValueError("bad HS256 signature")

    raise ValueError("unsupported alg")


# --- the SSTI blacklist ----------------------------------------------------
# blocks the obvious RCE / sandbox-escape routes; the builtins-open route is
# intentionally left reachable.
BANNED = [
    "{%", "%}", "os", "system", "popen", "subprocess", "eval", "exec",
    "import", "request", "config", "mro", "subclasses", "base64",
    "getattr", "setattr", "self", "lipsum", "attr(",
]


def wafed(s):
    low = s.lower()
    return any(bad in low for bad in BANNED)


# ---------------------------------------------------------------------------
# public pages
# ---------------------------------------------------------------------------
@app.route("/")
def index():
    global VISITS
    VISITS += 1
    return render_template("index.html", visits=VISITS, user=current_user())


@app.route("/guestbook", methods=["GET", "POST"])
def guestbook():
    if request.method == "POST":
        name = (request.form.get("name") or "anon").strip()[:32]
        msg = (request.form.get("msg") or "").strip()[:200]
        if msg:
            GUESTBOOK.append({"name": name, "msg": msg})
        return redirect(url_for("guestbook"))
    # NOTE: names/messages are auto-escaped by Jinja -> the guestbook is a
    # red herring, there is no XSS here.
    return render_template("guestbook.html", entries=reversed(GUESTBOOK),
                           user=current_user())


@app.route("/register", methods=["GET", "POST"])
def register():
    err = None
    if request.method == "POST":
        u = (request.form.get("username") or "").strip()[:32]
        p = request.form.get("password") or ""
        if not u or not p:
            err = "fill in both fields, baka!"
        elif u in USERS:
            err = "that handle is taken."
        else:
            USERS[u] = p
            resp = make_response(redirect(url_for("backstage")))
            resp.set_cookie("lucky_token", issue_token(u, "user"))
            return resp
    return render_template("register.html", err=err, user=current_user())


@app.route("/login", methods=["GET", "POST"])
def login():
    err = None
    if request.method == "POST":
        u = (request.form.get("username") or "").strip()
        p = request.form.get("password") or ""
        if USERS.get(u) == p:
            resp = make_response(redirect(url_for("backstage")))
            resp.set_cookie("lucky_token", issue_token(u, "user"))
            return resp
        err = "wrong handle or password~"
    return render_template("login.html", err=err, user=current_user())


@app.route("/logout")
def logout():
    resp = make_response(redirect(url_for("index")))
    resp.delete_cookie("lucky_token")
    return resp


# ---------------------------------------------------------------------------
# the members-only backstage (Stage 1 target) + broadcast preview (Stage 2)
# ---------------------------------------------------------------------------
@app.route("/backstage", methods=["GET", "POST"])
def backstage():
    tok = request.cookies.get("lucky_token")
    if not tok:
        return redirect(url_for("login"))

    # !! the vulnerable verifier (see decode_backstage): the legacy HS256
    # fallback HMACs with the published public key.
    try:
        data = decode_backstage(tok)
    except Exception:
        return redirect(url_for("login"))

    is_admin = data.get("role") == "admin"
    preview = None
    blocked = False

    if request.method == "POST":
        if not is_admin:
            abort(403, "Only Lucky Channel staff (admin) may broadcast.")
        tmpl = request.form.get("announcement") or ""
        if wafed(tmpl):
            blocked = True
        else:
            # Stage 2 sink: the broadcast is rendered as a template so staff
            # can use {{ site_name }} etc. in their announcements.
            try:
                preview = render_template_string(tmpl, site_name="Lucky Channel")
            except Exception as e:
                preview = "render error: %s" % e

    return render_template("backstage.html", data=data, is_admin=is_admin,
                           preview=preview, blocked=blocked, user=data)


# ---------------------------------------------------------------------------
# breadcrumbs
# ---------------------------------------------------------------------------
@app.route("/lucky-channel/pubkey")
def pubkey():
    # the RS256 public key -- published on purpose (this is normal for RS256)
    return Response(PUBLIC_KEY, mimetype="text/plain")


@app.route("/robots.txt")
def robots():
    body = (
        "User-agent: *\n"
        "Disallow: /backstage\n"
        "Disallow: /lucky-channel/pubkey\n"
        "# akira-sama says: the backstage is for staff only!!\n"
    )
    return Response(body, mimetype="text/plain")


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=1337)
