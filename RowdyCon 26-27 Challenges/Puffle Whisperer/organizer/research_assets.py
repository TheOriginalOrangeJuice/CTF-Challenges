"""Download reference material only. Record successes and failures honestly."""
import hashlib
import json
from pathlib import Path
import re
import sys
import urllib.request

dest = Path(sys.argv[1])
dest.mkdir(parents=True, exist_ok=True)
sources = {
    "igloo-reference.jpg": "https://fin1002sclubpenguinblog.files.wordpress.com/2009/12/how-to-play-cp1.jpg",
    "puffle-card-reference.jpg": "https://dojopenguins.files.wordpress.com/2009/02/pufflepcs.jpg",
    "puffle-play-reference.jpg": "https://dojopenguins.files.wordpress.com/2009/02/puffle-play.jpg",
    "wand-modules.txt": "https://raw.githubusercontent.com/solero/wand/master/.gitmodules",
    "basic-igloo.html": "https://www.clubpenguinwiki.info/wiki/Basic_Igloo",
    "legacy-tree.json": "https://git.solero.me/api/v4/projects/solero%2Flegacy-media/repository/tree?per_page=100",
}
report = []
for name, url in sources.items():
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"}), timeout=20) as response:
            data = response.read(5_000_000)
        (dest / name).write_bytes(data)
        row = {"file": name, "source": url, "sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data)}
        if name.endswith(".txt") or name.endswith(".json"):
            print(name, data.decode(errors="replace")[:4000], flush=True)
        elif name.endswith(".html"):
            print(name, re.findall(r'(?:src|href)=[\"\']([^\"\']+(?:png|swf)[^\"\']*)', data.decode(errors="replace"))[:30], flush=True)
        else:
            print(name, len(data), flush=True)
    except Exception as exc:
        row = {"source": url, "error": str(exc)}
        print(name, str(exc), flush=True)
    report.append(row)
(dest / "source-research.json").write_text(json.dumps(report, indent=2) + "\n")
