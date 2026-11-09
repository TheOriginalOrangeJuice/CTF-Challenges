"""Verify actual inference in the image with Docker networking disabled."""
import json
from pathlib import Path
import subprocess
import sys
import time

ROOT=Path(__file__).resolve().parents[1]
OUT=Path(sys.argv[1]);OUT.mkdir(parents=True,exist_ok=True)
NAME="puffle-offline-validation"
IMAGE="rowdy-puffle-whisperer:1"
def docker(*args,**kw):return subprocess.run(["docker",*args],check=True,text=True,capture_output=True,**kw)
test=r'''
import hashlib,httpx,json,os,time,uuid
from pathlib import Path
with httpx.Client(base_url="http://127.0.0.1:8080",timeout=180) as client:
 for attempt in range(90):
  try:
   if client.get("/readyz").status_code==200:break
  except httpx.HTTPError:pass
  time.sleep(1)
 else:raise RuntimeError("Image readiness timeout")
 initial=client.get("/api/state").json()
 assert not initial["solved"] and "invitation" not in initial
 rid=str(uuid.uuid4());started=time.monotonic()
 response=client.post("/api/chat",json={"text":"Hi Pip! What do you enjoy doing in your igloo?","request_id":rid})
 response.raise_for_status()
 with client.stream("GET",f"/api/chat/{rid}/events") as stream:
  for line in stream.iter_lines():
   if line.startswith("data: "):
    event=json.loads(line[6:])
    if event["status"] not in ["thinking","queued"]:break
 assert event["status"]=="complete" and event["reply"],event
 assert os.environ["FLAG"] not in event["reply"]
 print(json.dumps({"network":"none","ready":True,"real_reply":event["reply"],"turn_seconds":round(time.monotonic()-started,3),"peak_memory_bytes":int(Path("/sys/fs/cgroup/memory.peak").read_text()),"prompt_source_sha256":hashlib.sha256(Path("/app/server/prompt.py").read_bytes()).hexdigest()}))
'''
created=False
try:
    docker("run","--detach","--name",NAME,"--network","none","--cpus","4","--memory","4g","--read-only","--tmpfs","/tmp:size=64m,mode=1777","--tmpfs","/data:size=64m,uid=10001,gid=10001","--cap-drop","ALL","--security-opt","no-new-privileges:true","--env-file",str(ROOT/"organizer/event.env"),IMAGE)
    created=True
    result=docker("exec",NAME,"python","-c",test,timeout=240)
    report=json.loads(result.stdout)
    report["image_id"]=docker("image","inspect",IMAGE,"--format","{{.Id}}").stdout.strip()
    report["docker_vm_memory_bytes"]=int(docker("info","--format","{{.MemTotal}}").stdout.strip())
    report["target_4gb_hardware_qualified"]=False
    (OUT/"offline-image.json").write_text(json.dumps(report,indent=2)+"\n")
    print(json.dumps(report),flush=True)
finally:
    if created:
        logs=docker("logs",NAME)
        (OUT/"container.log").write_text(logs.stdout+logs.stderr)
        subprocess.run(["docker","stop","--timeout","20",NAME],capture_output=True)
        subprocess.run(["docker","rm",NAME],capture_output=True)
