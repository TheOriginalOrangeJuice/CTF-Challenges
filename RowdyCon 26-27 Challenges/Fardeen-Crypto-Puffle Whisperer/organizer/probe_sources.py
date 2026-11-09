"""Read upstream metadata and available runtime tools; never executes downloads."""
import json
import os
import urllib.request

def get(url):
    try:
        request = urllib.request.Request(url, headers={"User-Agent": "RowdyCon-puffle-asset-research"})
        with urllib.request.urlopen(request, timeout=25) as response:
            return json.load(response)
    except Exception as exc:
        return {"error": str(exc)}

for key, url in {
    "llama": "https://api.github.com/repos/ggml-org/llama.cpp/releases/tags/v0.2.0",
    "model": "https://huggingface.co/api/models/Qwen/Qwen2.5-1.5B-Instruct-GGUF",
    "assets": "https://api.github.com/search/repositories?q=clubpenguin+media&per_page=8",
}.items():
    result = get(url)
    if key == "llama":
        result = {k: result.get(k) for k in ["tag_name", "target_commitish", "message", "error"]} | {"assets": [{"name": a["name"], "url": a["browser_download_url"]} for a in result.get("assets", [])]}
    elif key == "model":
        result = {k: result.get(k) for k in ["sha", "error"]}
    else:
        result = {"items": [{"name": a["full_name"], "branch": a["default_branch"]} for a in result.get("items", [])], "error": result.get("error")}
    print(key, json.dumps(result), flush=True)
for directory in ["/tmp", "/home/fbhimani/.cache", "/home/fbhimani/.local/bin"]:
    try:
        print(directory, [name for name in os.listdir(directory) if any(s in name.lower() for s in ["playwright", "venv", "llama", "chrome", "doc", "rowdy"])], flush=True)
    except OSError:
        pass
