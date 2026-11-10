"""Fetch pinned CPU runtime/model into a task-owned cache and verify hashes."""
import hashlib
import json
from pathlib import Path
import sys
import tarfile
import urllib.request

root = Path(sys.argv[1])
root.mkdir(parents=True, exist_ok=True)
def get(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "RowdyCon-PuffleWhisperer"}), timeout=90)
def fetch(url, dest, expected=None):
    if not dest.exists():
        print("Downloading", dest.name, flush=True)
        with get(url) as response, dest.with_suffix(dest.suffix + ".part").open("wb") as output:
            while chunk := response.read(1024 * 1024):
                output.write(chunk)
        dest.with_suffix(dest.suffix + ".part").rename(dest)
    digest = hashlib.file_digest(dest.open("rb"), "sha256").hexdigest()
    if expected and digest != expected:
        raise RuntimeError(f"Checksum mismatch: {dest.name}")
    print(dest.name, digest, dest.stat().st_size, flush=True)
    return digest

release = json.load(get("https://api.github.com/repos/ggml-org/llama.cpp/releases/tags/b10566"))
asset = next(a for a in release["assets"] if a["name"].endswith("bin-ubuntu-x64.tar.gz"))
expected = (asset.get("digest") or "").removeprefix("sha256:") or None
runtime_hash = fetch(asset["browser_download_url"], root / asset["name"], expected)
binary = root / "llama"
if not binary.exists():
    binary.mkdir()
    with tarfile.open(root / asset["name"]) as archive:
        archive.extractall(binary, filter="data")
revision = "91cad51170dc346986eccefdc2dd33a9da36ead9"
model_name = "qwen2.5-1.5b-instruct-q4_k_m.gguf"
model_hash = fetch(f"https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/{revision}/{model_name}", root / model_name,
    "6a1a2eb6d15622bf3c96857206351ba97e1af16c30d7a74ee38970e434e9407e")
result = {"model_revision": revision, "model_file": model_name, "model_sha256": model_hash,
    "llama_version": "v0.2.0", "llama_build": "b10566", "llama_asset": asset["name"], "llama_sha256": runtime_hash,
    "llama_url": asset["browser_download_url"], "llama_commit": release["target_commitish"]}
(root / "runtime-lock.json").write_text(json.dumps(result, indent=2) + "\n")
print(json.dumps(result), flush=True)
