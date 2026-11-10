# F*** it, Everything To Shell

**Category:** Web · **Difficulty:** Easy/Medium · **Flag:** `CTF{g1t_h1st0ry_n3v3r_f0rg3ts_wh4t_y0u_d3l3t3d}`

## Player description

> Python? Node? PHP? We couldn't decide, so we said f*** it: everything gets a shell.
> Our shiny new sandbox platform drops you into a shell in every runtime. Go find the flag.
>
> `http://<host>:8080`

## Deployment

There is one image. Each container is a self-contained instance: players only need a browser, plus
any scripts they choose to write against the HTTP service.

```sh
docker build -t everything-to-shell .
docker run -d -p 8080:8080 -e FLAG='CTF{...}' \
  --read-only --tmpfs /tmp:size=16m --cap-drop ALL \
  --memory 64m --cpus 0.25 --pids-limit 64 everything-to-shell
```

| | |
|---|---|
| Port | `8080/tcp` (HTTP) |
| Env | `FLAG`: per-instance flag. Defaults to the static flag above if unset |
| User | non-root (uid 101), no capabilities needed |
| Filesystem | read-only works; only `/tmp` must be writable (tmpfs is fine) |
| Startup | under 1s. The git history is generated at boot from `FLAG`, so each instance can have a unique flag |
| Healthcheck | built in (`GET /`) |
| State | none. Restarting regenerates the instance identically |

Per-player platforms (CTFd + a container-instance plugin, kCTF, rCTF, k8s, etc.) only need to
launch this image per team, set `FLAG` (a unique per-team flag catches flag sharing), and expose
port 8080. `docker-compose.yml` is for local testing with the same hardening.

```sh
docker compose up -d --build
python3 solve/solve.py http://localhost:8080
```

## How it works (author notes, don't ship)

The three terminals are **100% fake**. `site/shell.js` is a client-side bash emulator with a
fake filesystem and fake Python/Node/PHP REPLs. Every classic move "works" just enough to waste time:
`os.system`, `execSync`, `system()`, backticks, `subprocess`, reverse shells (network unreachable),
`curl | sh` (DNS fails), `sudo` (not in sudoers), and `/flag.txt` (permission denied). There are no
requests to a backend. Players who read `shell.js` will figure that out, and that's intended.

**The real bug:** the site was deployed with `git pull` into the nginx web root, so `/.git/` is
exposed. The directory listing returns 403, but the individual files are served.

Git history (built by `build_repo.sh` at container start):

```
ui polish, bump to v2.3.1
robots.txt
remove .env from repo, oops       <- .env deleted here
add python/node/php terminals
wire up sandbox orchestrator config   <- .env with FLAG=... added here
init landing page
```

### Hints in the page
- HTML comment: `<!-- deploy: ssh prod 'cd /usr/share/nginx/html && git pull origin main' -->`
- Footer: "shipped straight from `main` 🚀"
- `/robots.txt` → `/flag.txt` is a troll.

### Intended solve
```sh
git-dumper http://host:8080/.git/ out
cd out && git log -p | grep FLAG
# or: git show HEAD~3:.env
```
`solve/solve.py` does the same with only the standard library: it walks loose objects from HEAD and
greps each blob.
