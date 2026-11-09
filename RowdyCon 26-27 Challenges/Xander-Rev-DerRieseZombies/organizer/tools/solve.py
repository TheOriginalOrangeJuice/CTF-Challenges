#!/usr/bin/env python3
"""Reference solver: recompute the round hash chain and decrypt the flag.

Usage: python3 tools/solve.py [path/to/flag_data.js or dist/game.js]

It extracts ZM.FLAG = {"ct": ..., "tag": ...} from the given file (default:
flag_data.js next to this repo), walks the chain from round 1 to 100 exactly as
the game does on each legitimate round advance, derives the key and decrypts.
"""
import hashlib
import json
import os
import re
import sys

SEED = "DER_RIESE::MAINFRAME::115"
TARGET_ROUND = 100


def h(s):
    return hashlib.sha256(s.encode()).hexdigest()


def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(root, "flag_data.js")
    src = open(path).read()
    m = re.search(r'ZM\.FLAG\s*=\s*(\{.*?\})\s*;', src, re.S) or re.search(r'FLAG\s*=\s*(\{[^}]*\})', src)
    if not m:
        print("no vault data found in", path)
        sys.exit(1)
    data = json.loads(m.group(1))
    state = h(SEED)
    for r in range(2, TARGET_ROUND + 1):
        state = h(state + ":" + str(r))
    key = h(state + ":FLAG")
    ct = bytes.fromhex(data["ct"])
    pt = bytearray()
    i = 0
    while len(pt) < len(ct):
        ks = hashlib.sha256((key + ":" + str(i)).encode()).digest()
        for j in range(32):
            if len(pt) < len(ct):
                pt.append(ct[len(pt)] ^ ks[j])
        i += 1
    ok = hashlib.sha256(bytes(pt)).hexdigest() == data["tag"]
    print("integrity:", "OK" if ok else "FAILED")
    print("flag:", pt.decode(errors="replace"))


if __name__ == "__main__":
    main()
