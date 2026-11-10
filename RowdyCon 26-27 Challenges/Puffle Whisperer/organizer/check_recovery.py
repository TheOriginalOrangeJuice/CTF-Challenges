"""Bounded benign queue, owned-model failure and container persistence checks."""
import asyncio
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import time
import uuid
import httpx

ROOT = Path(__file__).resolve().parents[1]
OUT = Path(sys.argv[1]); OUT.mkdir(parents=True, exist_ok=True)
BASE = "http://localhost:18116"
CONTAINER = "rowdy-puffle-whisperer-igloo-1"
FLAG = next(x.partition("=")[2] for x in (ROOT/"organizer/event.env").read_text().splitlines() if x.startswith("FLAG="))
report = {"checks": [], "scope": "Only the task-owned challenge container; benign ordinary dialogue", "source_hashes": {p.relative_to(ROOT).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest() for p in (ROOT/"challenge").rglob("*") if p.is_file()}}

def check(name, condition, details=None):
    report["checks"].append({"name": name, "passed": bool(condition), "details": details})
    (OUT/"recovery.json").write_text(json.dumps(report, indent=2)+"\n")
    print(name, "PASS" if condition else "FAIL", flush=True)
    assert condition, (name, details)

async def docker(*args):
    process = await asyncio.create_subprocess_exec("docker", *args, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
    out, err = await process.communicate()
    assert process.returncode == 0, err.decode()
    return out.decode()

async def submit(client, text):
    rid = str(uuid.uuid4())
    r = await client.post("/api/chat", json={"text": text, "request_id": rid})
    assert r.status_code == 200, r.text
    return rid

async def state(client):
    return (await client.get("/api/state")).json()

async def terminal(client, rid):
    started = time.monotonic()
    async with client.stream("GET", f"/api/chat/{rid}/events", timeout=240) as response:
        async for line in response.aiter_lines():
            if line.startswith("data: "):
                event = json.loads(line[6:])
                if event["status"] not in ["queued", "thinking"]:
                    return {"event": event, "seconds": round(time.monotonic()-started, 3)}
    raise AssertionError("Missing terminal event")

async def ready(client):
    for _ in range(180):
        try:
            if (await client.get("/readyz", timeout=3)).status_code == 200:
                return
        except httpx.HTTPError:
            pass
        await asyncio.sleep(1)
    raise AssertionError("Readiness did not recover")

async def main():
    inspection = json.loads(await docker("inspect", CONTAINER))[0]
    check("owned-compose-service", inspection["Config"]["Labels"]["com.docker.compose.project"] == "rowdy-puffle-whisperer")
    report["image"] = inspection["Image"]
    report["limits"] = {k: inspection["HostConfig"][k] for k in ["Memory", "NanoCpus", "ReadonlyRootfs", "CapDrop", "SecurityOpt", "PortBindings"]}
    async with httpx.AsyncClient(base_url=BASE, timeout=180) as a, httpx.AsyncClient(base_url=BASE, timeout=180) as b, httpx.AsyncClient(base_url=BASE, timeout=180) as c:
        clients = [a,b,c]
        await ready(a)
        await asyncio.gather(*(state(x) for x in clients))
        for round_number in range(2):
            ids = await asyncio.gather(*(submit(x, "Hi Pip! Tell me about your favourite igloo decoration.") for x in clients))
            replies = await asyncio.gather(*(terminal(x,rid) for x,rid in zip(clients,ids)))
            check(f"three-session-repeat-{round_number+1}", all(r["event"]["status"] == "complete" and r["event"]["reply"] and FLAG not in r["event"]["reply"] for r in replies), replies)
        rid = await submit(a, "Tell me a long cheerful story about three puffles decorating their igloo.")
        for _ in range(100):
            turn = next(t for t in (await state(a))["turns"] if t["request_id"] == rid)
            if turn["status"] == "thinking": break
            await asyncio.sleep(.1)
        check("failure-test-turn-active", turn["status"] == "thinking")
        # Identify the private child by its exact executable, rather than guessing a PID.
        kill_child = """from pathlib import Path
import os,signal,json
matches=[]
for path in Path('/proc').glob('[0-9]*/cmdline'):
    try: argv=path.read_bytes().split(b'\\0')
    except (FileNotFoundError,PermissionError,ProcessLookupError): continue
    if argv[0]==b'/opt/llama/llama-server': matches.append(int(path.parent.name))
assert len(matches)==1,matches
os.kill(matches[0],signal.SIGTERM)
print(json.dumps({'terminated_private_child':matches[0]}))
"""
        report["failure_injection"] = json.loads(await docker("exec", CONTAINER, "python", "-c", kill_child))
        failed = await terminal(a, rid)
        check("model-failure-recorded-without-reward", failed["event"]["status"] == "error" and not (await state(a))["solved"], failed)
        await ready(a)
        recovered = await terminal(a, await submit(a, "Hello again! What colour are you?"))
        check("supervisor-restarts-real-model", recovered["event"]["status"] == "complete" and bool(recovered["event"]["reply"]), recovered)
        before = await state(a)
        await a.put("/api/room", json={**before["room"], "color": "purple"})
        await a.post("/api/puffle/pip/care", json={"action": "feed"})
        # This tests persistence of an already verified reward, not the solve path.
        await a.post("/api/claim", json={"code": FLAG})
        saved = await state(a)
        await docker("restart", "--time", "25", CONTAINER)
        await ready(a)
        restored = await state(a)
        check("container-restart-persists-session-room-care-transcript-reward", all(restored[key] == saved[key] for key in ["room", "pets", "turns", "solved", "invitation"]))
        neighbour = await state(b)
        check("restart-preserves-ownership", not neighbour["solved"] and neighbour["room"]["color"] == "blue")
        again = await terminal(a, await submit(a, "What music do puffles like dancing to?"))
        check("inference-after-container-restart", again["event"]["status"] == "complete" and bool(again["event"]["reply"]), again)
    report["passed"] = True
    (OUT/"recovery.json").write_text(json.dumps(report, indent=2)+"\n")

asyncio.run(main())
