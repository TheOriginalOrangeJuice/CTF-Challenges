"""Docker build helper: fetch exact runtime/model artifacts, verifying both."""
import hashlib
import json
from pathlib import Path
import shutil
import tarfile
import urllib.request

lock = json.loads(Path("/build/runtime-lock.json").read_text())
def download(url, dest, expected):
    with urllib.request.urlopen(url, timeout=180) as response, dest.open("wb") as output:
        shutil.copyfileobj(response, output)
    if hashlib.file_digest(dest.open("rb"), "sha256").hexdigest() != expected:
        raise RuntimeError("Artifact checksum mismatch: " + dest.name)

Path("/opt/model").mkdir(parents=True, exist_ok=True)
download(f'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/{lock["model_revision"]}/{lock["model_file"]}', Path("/opt/model")/lock["model_file"], lock["model_sha256"])
download(lock["llama_url"], Path("/tmp/llama.tar.gz"), lock["llama_sha256"])
with tarfile.open("/tmp/llama.tar.gz") as archive:
    archive.extractall("/tmp/llama-extract", filter="data")
source = next(Path("/tmp/llama-extract").rglob("llama-server")).parent
Path("/opt/llama").mkdir()
for file in source.iterdir():
    if file.name == "llama-server" or ".so" in file.name:
        shutil.copy2(file, Path("/opt/llama") / file.name)
