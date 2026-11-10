"""Preserve the actual 2009 care-card reference separately from the party banner."""
import hashlib
import json
from pathlib import Path
import sys
import urllib.request

out = Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
records = []
for name in ["shine", "sparkle-fullbars11"]:
    url = f"https://dojopenguins.files.wordpress.com/2009/02/{name}.jpg"
    data = urllib.request.urlopen(url, timeout=30).read()
    (out/(name+".jpg")).write_bytes(data)
    records.append({"file": name+".jpg", "source": url, "sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data), "rights": "Club Penguin/Disney reference image; archive access grants no new artwork license."})
(out/"care-reference-sources.json").write_text(json.dumps(records, indent=2)+"\n")
print(json.dumps(records))
