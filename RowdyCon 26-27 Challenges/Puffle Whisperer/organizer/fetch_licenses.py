"""Freeze upstream runtime/model license texts at the exact approved revisions."""
import hashlib
import json
from pathlib import Path
import sys
import urllib.request

root=Path(__file__).resolve().parents[1]
lock=json.loads((root/'challenge/runtime-lock.json').read_text())
out=Path(sys.argv[1]);out.mkdir(parents=True,exist_ok=True)
sources={
    'llama.cpp-MIT.txt':f"https://raw.githubusercontent.com/ggml-org/llama.cpp/{lock['llama_commit']}/LICENSE",
    'Qwen2.5-Apache-2.0.txt':f"https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/{lock['model_revision']}/LICENSE",
}
records=[]
for name,url in sources.items():
    data=urllib.request.urlopen(url,timeout=30).read()
    (out/name).write_bytes(data)
    records.append({'file':name,'source':url,'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data)})
(out/'sources.json').write_text(json.dumps(records,indent=2)+'\n')
print(json.dumps(records))
