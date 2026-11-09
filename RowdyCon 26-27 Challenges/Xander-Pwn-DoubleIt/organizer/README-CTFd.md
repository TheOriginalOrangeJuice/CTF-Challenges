# Importing "Double It" into CTFd

Everything an organizer needs to get this challenge live in a
[CTFd](https://ctfd.io) instance. Two paths: the web admin panel (quick,
click-through) or `ctfcli` (scriptable, version-controlled).

---

## 0. Prerequisites — build the artifacts first

From the `DOUBLE_IT/` directory:

```sh
make dist
```

This produces:

- `dist/double_it.tar.gz` — the player download (binary + **fake** test flag + README)
- `double_it` — the local copy used by the server

Then stand up the networked service so `nc HOST PORT` works (players need a live
socket to grab the real flag):

```sh
# bare metal (needs socat):
FLAG='flag{your_real_flag}' PORT=1337 ./server/serve.sh

# or containerized:
docker build -t double_it -f server/Dockerfile .
docker run --rm -p 1337:1337 -e FLAG='flag{your_real_flag}' double_it
```

Note the public **HOST** and **PORT** — you'll paste them into the challenge
description.

---

## Path A — CTFd web admin panel (no CLI)

1. Log in as admin → **Admin Panel → Challenges → `+` (Create Challenge)**.
2. **Challenge type:** `standard`.
3. **Name:** `Double It And Give It To The Next Person`
4. **Category:** `pwn`
5. **Message / description:**
   ```
   You start with $1. The rules are simple: double it and give it to the
   next person. Nobody ever breaks the chain... right?

   Connect:  nc HOST PORT

   The download has the binary and a FAKE test flag so you can build your
   exploit locally. The real flag only lives on the server.
   ```
   (Replace `HOST`/`PORT` with your live values.)
6. **Value:** `100` → **Create**.
7. On the challenge's edit page:
   - **Files:** upload `dist/double_it.tar.gz`.
   - **Flags:** add a **static** flag = your real `flag{...}`
     (case-sensitive, exact match).
   - **Hints** (optional, with costs):
     - `How many bytes are read, and how big is the buffer?` — cost 0
     - `A function handles the flag but is never called. nm double_it.` — cost 10
     - `Crashes as it shells out? 16-byte stack alignment (movaps) — return through one extra ret gadget first.` — cost 25
   - **Tags:** `pwn`, `buffer-overflow`, `ret2win`, `stack-alignment`.
8. Set **State → Visible** when you're ready to open it.

---

## Path B — `ctfcli` (scripted import)

```sh
pip install ctfcli

# one-time, point it at your CTFd instance:
ctf init                       # prompts for URL + admin access token

# edit challenge.yml -> set the REAL flag and HOST/PORT, then:
ctf challenge install challenge.yml
ctf challenge sync    challenge.yml     # push later edits
```

`challenge.yml` in this directory already declares the name, category,
description, `dist/double_it.tar.gz` as the file, hints, tags, and a flag
placeholder. **Edit the `flags:` value to your real flag before importing** —
and don't commit the real value to a public repo.

---

## Deployment options for the live service

CTFd itself only hosts the files + flag; the running binary is served
separately. Pick one:

| Option | How |
|--------|-----|
| **Manual** | Run `server/serve.sh` (or the Docker container) on a public host; put its `HOST PORT` in the description. Simplest. |
| **Docker** | `server/Dockerfile` builds a self-contained forking socat service; set the flag via `-e FLAG=...`. |
| **CTFd plugin** | If you run [`ctfd-whale`](https://github.com/glzjin/ctfd-whale) or a similar on-demand-container plugin, point it at `server/Dockerfile` for per-team instances. |

Harden the host before a public event: run the container as the unprivileged
`ctf` user (the Dockerfile already does), drop it in a network namespace or
sandbox, and rate-limit connections — `socat`'s `fork` spawns one process per
connection.

---

## Pre-event checklist

- [ ] `make dist` run; `dist/double_it.tar.gz` uploaded to CTFd.
- [ ] Live service reachable: `nc HOST PORT` prints the banner.
- [ ] Real flag set **identically** in the service (`$FLAG`) and in CTFd.
- [ ] Player bundle contains only the **fake** flag (`cat dist/double_it/flag.txt`).
- [ ] Reference exploit passes against the live service:
      `./solve/solve.py HOST PORT`
- [ ] `WRITEUP.md` and `solve/` are **not** attached to the public challenge.
