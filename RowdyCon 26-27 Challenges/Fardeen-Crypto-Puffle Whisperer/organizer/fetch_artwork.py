"""Fetch original archived assets and local extraction tools into isolated output."""
import concurrent.futures
import hashlib
import json
from pathlib import Path
import sys
import tarfile
import urllib.parse
import urllib.request
import zipfile

root = Path(sys.argv[1])
root.mkdir(parents=True, exist_ok=True)
def get(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"}), timeout=90)
def fetch(url, file):
    if not file.exists():
        with get(url) as source, file.open("wb") as target:
            while chunk := source.read(1024*1024): target.write(chunk)
    return hashlib.file_digest(file.open("rb"), "sha256").hexdigest()

revision = "b3a86b70689a38fdf8773c250aa576551acb65b8"
base = "https://git.solero.me/api/v4/projects/solero%2Flegacy-media/repository/files/"
paths = {
    "igloo.swf": "content/global/igloo/igloos/1.swf",
    "landscape.swf": "content/global/igloo/assets/igloo_background.swf",
    "penguin.swf": "content/global/penguin/penguin.swf",
    "interface.swf": "client/interface.swf",
    "crumbs.swf": "content/global/crumbs/global_crumbs.swf",
}
for color in ["blue","red","purple"]:
    paths[f"puffle-{color}.swf"] = f"content/global/puffle/sprites/{color}.swf"
    paths[f"card-{color}.swf"] = f"content/global/puffle/icons/{color}.swf"
paths["local-crumbs.swf"] = "content/local/en/crumbs/local_crumbs.swf"
for n in [6,10,151,162,164,200,225,210]:
    paths[f"furniture-{n}.swf"] = f"content/global/furniture/sprites/{n}.swf"
for n in [1,2]: paths[f"music-{n}.swf"] = f"content/global/music/{n}.swf"

def item(pair):
    name, path = pair
    url = base + urllib.parse.quote("media/play/v2/" + path, safe="") + "/raw?ref=" + revision
    try:
        digest = fetch(url, root / name)
        return {"file": name, "source": url, "sha256": digest, "rights": "Original Club Penguin/Disney artwork and audio; archive provides access, not a new license. Educational CTF reference/reuse; no claim of public-domain or open-source artwork."}
    except Exception as exc:
        return {"file": name, "source": url, "error": str(exc)}

with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    report = list(pool.map(item, paths.items()))
(root / "sources.json").write_text(json.dumps(report, indent=2) + "\n")
print("Original assets:", len([r for r in report if "sha256" in r]), "of", len(report), flush=True)
for row in report:
    if "error" in row: print(row, flush=True)

jre = json.load(get("https://api.adoptium.net/v3/assets/latest/17/hotspot?architecture=x64&image_type=jre&os=linux"))[0]["binary"]["package"]
digest = fetch(jre["link"], root / "jre.tar.gz")
if digest != jre["checksum"]: raise RuntimeError("JRE hash mismatch")
if not (root / "jre").exists():
    (root / "jre").mkdir()
    with tarfile.open(root / "jre.tar.gz") as archive: archive.extractall(root / "jre", filter="data")
ffdec = json.load(get("https://api.github.com/repos/jindrapetrik/jpexs-decompiler/releases/latest"))
asset = next(a for a in ffdec["assets"] if a["name"].endswith(".zip") and "lib" not in a["name"])
digest = fetch(asset["browser_download_url"], root / "ffdec.zip")
expected = (asset.get("digest") or "").removeprefix("sha256:")
if expected and digest != expected: raise RuntimeError("FFDec hash mismatch")
if not (root / "ffdec").exists():
    with zipfile.ZipFile(root / "ffdec.zip") as archive: archive.extractall(root / "ffdec")
(root / "extraction-tools.json").write_text(json.dumps({"jre": jre, "ffdec": {"version": ffdec["tag_name"], "url": asset["browser_download_url"], "sha256": digest}}, indent=2)+"\n")
print("Extraction tools ready", flush=True)
