#!/usr/bin/env python3
"""
Reference solver for "Final_Final_REAL".

  python3 -I solve.py path/to/Final_Final_REAL [out.png]

1. Replay the recovery journal over saved_state with linear undo/redo
   (edit.apply clears redo; undo/redo move whole units between stacks).
2. Take the six ENDCARD events (blend = difference).
3. For each: bit 0 of its PNG -> pan_crop -> flip_h -> place at transform.x/y,
   XOR onto a canvas-sized 1-bit plane.
4. The canvas reads the flag.
"""
import copy
import json
import sys
from pathlib import Path

from PIL import Image


def main():
    root = Path(sys.argv[1])
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else Path("endcard.png")
    proj = json.loads(next(root.glob("*.recovery.json")).read_text())

    state = {e["id"]: copy.deepcopy(e) for e in proj["saved_state"]["events"]}

    def get(ev, path):
        a, b = path.split(".")
        return state[ev][a][b]

    def put(ev, path, v):
        a, b = path.split(".")
        state[ev][a][b] = v

    undo, redo = [], []
    for ent in proj["journal"]:
        if ent["cmd"] == "edit.apply":
            unit = [(c["event"], c["path"], get(c["event"], c["path"]), c["value"])
                    for c in ent["changes"]]
            for ev, p, _, new in unit:
                put(ev, p, new)
            undo.append(unit)
            redo.clear()
        elif ent["cmd"] == "edit.undo" and undo:
            unit = undo.pop()
            for ev, p, old, _ in reversed(unit):
                put(ev, p, old)
            redo.append(unit)
        elif ent["cmd"] == "edit.redo" and redo:
            unit = redo.pop()
            for ev, p, _, new in unit:
                put(ev, p, new)
            undo.append(unit)

    cw = proj["project"]["canvas"]["width"]
    ch = proj["project"]["canvas"]["height"]
    canvas = bytearray(cw * ch)
    media = {m["name"]: m for m in proj["media"]}
    for ev in state.values():
        if ev["blend"] != "difference":
            continue
        im = Image.open(root / media[ev["media"]]["path"]).convert("RGBA")
        w = im.width
        lsb = im.getchannel("R").tobytes()
        c, t = ev["pan_crop"], ev["transform"]
        print(f"{ev['id']} {ev['label']:<26} crop=({c['x']},{c['y']}) "
              f"flip={t['flip_h']} pos=({t['x']},{t['y']})")
        for y in range(c["h"]):
            o = (c["y"] + y) * w + c["x"]
            row = [b & 1 for b in lsb[o:o + c["w"]]]
            if t["flip_h"]:
                row.reverse()
            base = (t["y"] + y) * cw + t["x"]
            for x, b in enumerate(row):
                canvas[base + x] ^= b

    Image.frombytes("L", (cw, ch), bytes(255 * b for b in canvas)).save(out)
    print(f"[+] wrote {out}")


if __name__ == "__main__":
    main()
