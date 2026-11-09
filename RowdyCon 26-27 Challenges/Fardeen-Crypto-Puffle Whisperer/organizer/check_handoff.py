"""Verify shipped source against the running image and freeze runtime evidence."""
import ast
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import httpx

ROOT = Path(__file__).resolve().parents[1]
OUT = Path(sys.argv[1]); OUT.mkdir(parents=True, exist_ok=True)
NAME = "rowdy-puffle-whisperer-igloo-1"

def command(*args):
    return subprocess.check_output(args, text=True).strip()

probe = """import hashlib,json,subprocess
from pathlib import Path
root=Path('/app')
files={p.relative_to(root).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in root.rglob('*') if p.is_file()}
with open('/opt/model/qwen2.5-1.5b-instruct-q4_k_m.gguf','rb') as model: model_hash=hashlib.file_digest(model,'sha256').hexdigest()
version=subprocess.run(['/opt/llama/llama-server','--version'],capture_output=True,text=True)
print(json.dumps({'files':files,'model_sha256':model_hash,'runtime_version':version.stdout+version.stderr,'memory_peak_bytes':int(Path('/sys/fs/cgroup/memory.peak').read_text()),'memory_events':Path('/sys/fs/cgroup/memory.events').read_text(),'dependencies':subprocess.check_output(['pip','freeze'],text=True)}))
"""
actual = json.loads(command("docker", "exec", NAME, "python", "-c", probe))
expected = {p.relative_to(ROOT/"challenge").as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for group in [ROOT/"challenge/server", ROOT/"challenge/public"] for p in group.rglob("*") if p.is_file()}
expected["requirements.txt"] = hashlib.sha256((ROOT/"challenge/requirements.txt").read_bytes()).hexdigest()
assert actual["files"] == expected, "Running image differs from verified source"
lock = json.loads((ROOT/"challenge/runtime-lock.json").read_text())
assert actual["model_sha256"] == lock["model_sha256"]
assert lock["llama_commit"][:7] in actual["runtime_version"]
requirements = (ROOT/"challenge/requirements.txt").read_text().splitlines()
installed = {line.lower().replace("_","-") for line in actual["dependencies"].splitlines()}
assert all(line.lower().replace("_","-") in installed for line in requirements if line.strip() and not line.startswith("#"))
inspection = json.loads(command("docker", "inspect", NAME))[0]
assert inspection["Config"]["Labels"]["com.docker.compose.project"] == "rowdy-puffle-whisperer"
assert inspection["HostConfig"]["Memory"] == 4*1024**3
assert inspection["HostConfig"]["NanoCpus"] == 4*10**9
assert list(inspection["HostConfig"]["PortBindings"]) == ["8080/tcp"]
assert all("organizer" not in p and "Description" not in p for p in actual["files"])
assert httpx.get("http://localhost:18116/readyz").json() == {"ready": True}
tree = ast.parse((ROOT/"challenge/server/app.py").read_text())
starting_room = next(ast.literal_eval(n.value) for n in tree.body if isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id=="DEFAULT_ROOM" for t in n.targets))
frozen = {
    "runtime": lock,
    "image_id": inspection["Image"],
    "source_files": {"challenge/"+k:v for k,v in expected.items()},
    "prompt_source_sha256": expected["server/prompt.py"],
    "private_organizer_configuration_sha256": hashlib.sha256((ROOT/"organizer/event.env").read_bytes()).hexdigest(),
    "inference": {"threads":4,"parallel_slots":1,"context_tokens":4096,"history_budget_tokens":3800,"max_reply_tokens":128,"temperature":0,"seed":1616,"cache_prompt":False,"gpu_layers":0,"batch":256,"micro_batch":128},
    "translator_protocol": {"incoming_formats":["b64","hex","dec","bin"],"raw_chat_character_limit":74000,"decoded_character_limit":2000,"message_token_limit":1024,"encoded_disclosure":"only a final assistant packet that strictly decodes to the flag sets disclosed","candidate_output_policy":"Base64 is the compact supported fallback; matching DEC/BIN output exceeds the frozen 128-token cap."},
    "starting_room": starting_room,
    "starting_pets": {pet:{"food":70,"energy":80,"play":60} for pet in ["pip","bubbles","pebble"]},
    "inventory":["sofa","chair","rug","plant","stereo","bed","bowl","toy"],
    "hardware": {"docker_vm_memory_bytes":int(command("docker","info","--format","{{.MemTotal}}")),"cpu":command("lscpu","--json")},
    "actual_image_runtime": {k:v for k,v in actual.items() if k!="files"},
    "deployment":{"project":"rowdy-puffle-whisperer","container":NAME,"port":18116,"volume":"rowdy-puffle-whisperer_igloo-data","configured_memory_bytes":inspection["HostConfig"]["Memory"],"configured_cpu_cores":4,"read_only_root":inspection["HostConfig"]["ReadonlyRootfs"]},
    "qualification_limit":"Available Docker VM memory is below the 4 GB target. Identical generation on untested hardware is not claimed."
}
(OUT/"frozen-config.json").write_text(json.dumps(frozen,indent=2)+"\n")
(OUT/"handoff-check.json").write_text(json.dumps({"passed":True,"source_image_sha256_differences":0,"model_sha256_verified":True,"runtime_commit_verified":True,"dependencies_verified":True,"organizer_files_absent_from_image":True,"readiness":True,"image_id":inspection["Image"]},indent=2)+"\n")
print(json.dumps({"passed":True,"image":inspection["Image"],"source_image_files":len(expected),"memory_peak_bytes":actual["memory_peak_bytes"]}))
