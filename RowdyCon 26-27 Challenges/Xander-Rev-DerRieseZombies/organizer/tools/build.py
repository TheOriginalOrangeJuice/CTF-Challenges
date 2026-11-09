#!/usr/bin/env python3
"""Bundle the game for distribution.

Produces dist/index.html + dist/game.js. All sources are concatenated in order and wrapped in
an IIFE with a private `ZM` namespace, so nothing is reachable from the global scope and the
development hooks (window.ZMDEV) are stripped.

Usage: python3 tools/build.py
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
JS = os.path.join(ROOT, "js")
DIST = os.path.join(ROOT, "dist")

ORDER = [
    "00_core.js", "05_vault.js", "10_audio.js", "20_textures.js", "30_renderer.js", "60_weapons.js", "45_props.js", "40_map.js", "50_nav.js", "70_entities.js", "80_player.js", "90_game.js", "95_hud.js", "97_settings.js", "99_main.js",
]


def main():
    flag_path = os.path.join(ROOT, "flag_data.js")
    if not os.path.exists(flag_path):
        print("flag_data.js missing — run: python3 tools/gen_flag.py 'flag{...}'")
        sys.exit(1)
    parts = ["(function () {\n'use strict';\nconst ZM = {};\n"]
    for name in ORDER:
        src = open(os.path.join(JS, name), encoding="utf-8").read()
        if name == "99_main.js":
            src = re.sub(r"\n  if \(ZM\.DEV\) \{.*?\n  \}\n", "\n", src, flags=re.S)
            assert "ZMDEV" not in src, "dev hooks not stripped"
        parts.append(f"\n// ===== {name} =====\n{src}\n")
    parts.append("\n// ===== flag_data.js =====\n" + open(flag_path, encoding="utf-8").read())
    parts.append("\n})();\n")
    os.makedirs(DIST, exist_ok=True)
    with open(os.path.join(DIST, "game.js"), "w", encoding="utf-8") as f:
        f.write("".join(parts))
    html = open(os.path.join(ROOT, "index.html"), encoding="utf-8").read()
    html = re.sub(r"<script>.*?</script>\n(?:<script src=\"[^\"]+\"></script>\n)+", '<script src="game.js"></script>\n', html, flags=re.S)
    html = html.replace("Der Riese — Zombies (dev)", "Der Riese — Zombies")
    assert 'src="game.js"' in html and "js/" not in html
    with open(os.path.join(DIST, "index.html"), "w", encoding="utf-8") as f:
        f.write(html)
    size = os.path.getsize(os.path.join(DIST, "game.js"))
    print(f"wrote {DIST}/index.html and {DIST}/game.js ({size // 1024} KiB)")


if __name__ == "__main__":
    main()
