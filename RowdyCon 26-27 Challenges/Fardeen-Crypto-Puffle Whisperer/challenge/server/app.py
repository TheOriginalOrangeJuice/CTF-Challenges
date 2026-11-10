"""Private igloos and a deliberately prompt-vulnerable, tool-free puffle."""
import asyncio
from contextlib import asynccontextmanager
import hashlib
import json
import logging
import os
from pathlib import Path
import re
import secrets
import sqlite3
import subprocess
import time
from typing import Literal
from uuid import UUID

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field

from prompt import system_prompt
from protocol import LABELS, ProtocolError, decode_message, encoded_flag_in_reply, model_message

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
DATA = Path(os.environ.get("DATA_DIR", "/data"))
FLAG = os.environ["FLAG"]
if not re.fullmatch(r"RCC\{[^{}\r\n]{8,180}\}", FLAG):
    raise RuntimeError("Supply a valid invitation flag in the private organizer configuration.")
ORIGIN = os.environ.get("PUBLIC_ORIGIN", "http://localhost:18116").rstrip("/")
MODEL_URL = "http://127.0.0.1:19116"
COOKIE = "puffle_session"
MAX_REQUEST_BYTES = 80000
INVENTORY = ["sofa", "chair", "rug", "plant", "stereo", "bed", "bowl", "toy"]
COLORS = ["blue", "red", "green", "purple", "orange", "pink"]
DEFAULT_ROOM = {"color": "blue", "furniture": [
    {"kind": "sofa", "x": 306, "y": 288, "rotation": 0},
    {"kind": "rug", "x": 385, "y": 345, "rotation": 0},
    {"kind": "plant", "x": 485, "y": 285, "rotation": 0},
    {"kind": "stereo", "x": 440, "y": 267, "rotation": 0},
    {"kind": "bed", "x": 240, "y": 335, "rotation": 0},
    {"kind": "bowl", "x": 503, "y": 341, "rotation": 0},
    {"kind": "toy", "x": 533, "y": 371, "rotation": 0},
]}
DEFAULT_PETS = {name: {"food": 70, "energy": 80, "play": 60} for name in ["pip", "bubbles", "pebble"]}
db = None
client = None
queue = asyncio.Queue(maxsize=8)
waiting = []
active = None
active_task = None
logger = logging.getLogger("uvicorn.error")

def query(sql, args=()):
    return db.execute(sql, args)

def session_id(request):
    token = request.cookies.get(COOKIE, "")
    if not token or len(token) > 100:
        raise HTTPException(401, "Open your igloo again to reconnect.")
    sid = hashlib.sha256(token.encode()).hexdigest()
    if not query("SELECT id FROM sessions WHERE id=?", (sid,)).fetchone():
        raise HTTPException(401, "Open your igloo again to reconnect.")
    return sid

def get_state(sid):
    row = query("SELECT * FROM sessions WHERE id=?", (sid,)).fetchone()
    turns = [dict(r) for r in query("SELECT request_id,text,reply,status,trimmed,encoding FROM turns WHERE session=? ORDER BY number", (sid,))]
    state = {"room": json.loads(row["room"]), "pets": json.loads(row["pets"]), "disclosed": bool(row["disclosed"]), "solved": bool(row["solved"]), "turns": turns}
    if row["solved"]:
        state["invitation"] = FLAG
    return state

async def model_ready():
    try:
        return (await client.get(MODEL_URL + "/health", timeout=2)).status_code == 200
    except httpx.HTTPError:
        return False

async def tokens(text):
    response = await client.post(MODEL_URL + "/tokenize", json={"content": text, "add_special": False, "parse_special": True})
    response.raise_for_status()
    return len(response.json()["tokens"])

async def context_for(sid, text, encoding):
    pairs = [dict(r) for r in query("SELECT text,decoded,encoding,reply FROM turns WHERE session=? AND status='complete' ORDER BY number", (sid,))]
    trimmed = False
    while True:
        messages = [{"role": "system", "content": system_prompt(FLAG)}]
        for pair in pairs:
            messages.extend([{"role": "user", "content": model_message(pair["decoded"] or pair["text"], pair["encoding"])}, {"role": "assistant", "content": pair["reply"]}])
        messages.append({"role": "user", "content": model_message(text, encoding)})
        response = await client.post(MODEL_URL + "/apply-template", json={"messages": messages, "add_generation_prompt": True})
        response.raise_for_status()
        if await tokens(response.json()["prompt"]) <= 3800:
            return messages, trimmed
        if not pairs:
            raise ValueError("That message is too long for Pip to read.")
        pairs.pop(0)
        trimmed = True

async def generate(sid, request_id):
    row = query("SELECT * FROM turns WHERE session=? AND request_id=?", (sid, request_id)).fetchone()
    messages, trimmed = await context_for(sid, row["decoded"] or row["text"], row["encoding"])
    query("UPDATE turns SET status='thinking',trimmed=? WHERE session=? AND request_id=?", (int(trimmed), sid, request_id))
    answer = ""
    async with asyncio.timeout(150):
        async with client.stream("POST", MODEL_URL + "/v1/chat/completions", json={"messages": messages, "temperature": 0,
                "seed": 1616, "max_tokens": 128, "stream": True, "cache_prompt": False}, timeout=httpx.Timeout(90, connect=5)) as response:
            response.raise_for_status()
            async for line in response.aiter_lines():
                if not line.startswith("data: ") or line == "data: [DONE]":
                    continue
                chunk = json.loads(line[6:])
                if not chunk.get("choices"):
                    continue
                answer += chunk["choices"][0].get("delta", {}).get("content") or ""
                query("UPDATE turns SET reply=? WHERE session=? AND request_id=?", (answer, sid, request_id))
    if not answer.strip():
        raise ValueError("Pip's translator did not return a reply.")
    if FLAG in answer:
        query("UPDATE sessions SET disclosed=1,solved=1 WHERE id=?", (sid,))
    elif encoded_flag_in_reply(answer, FLAG):
        query("UPDATE sessions SET disclosed=1 WHERE id=?", (sid,))
    query("UPDATE turns SET status='complete' WHERE session=? AND request_id=?", (sid, request_id))

async def worker():
    global active, active_task
    while True:
        key = await queue.get()
        try:
            if key in waiting:
                waiting.remove(key)
            row = query("SELECT status FROM turns WHERE session=? AND request_id=?", key).fetchone()
            if not row or row["status"] != "queued":
                continue
            active = key
            active_task = asyncio.create_task(generate(*key))
            try:
                await active_task
            except asyncio.CancelledError:
                query("UPDATE turns SET status='cancelled' WHERE session=? AND request_id=? AND status IN ('thinking','queued')", key)
                if asyncio.current_task().cancelling():
                    raise
            except Exception:
                logger.exception("Pip inference turn failed")
                query("UPDATE turns SET status='error' WHERE session=? AND request_id=?", key)
        finally:
            active = None
            active_task = None
            queue.task_done()

async def supervise_model(command):
    """Restart only our private inference child if it exits unexpectedly."""
    while True:
        proc = subprocess.Popen(command, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        try:
            while proc.poll() is None:
                await asyncio.sleep(.5)
            logger.error("Private inference process exited with code %s; restarting", proc.returncode)
        finally:
            if proc.poll() is None:
                proc.terminate()
                try:
                    await asyncio.to_thread(proc.wait, timeout=15)
                except subprocess.TimeoutExpired:
                    proc.kill()
                    await asyncio.to_thread(proc.wait)
        await asyncio.sleep(1)

@asynccontextmanager
async def lifespan(app):
    global db, client
    DATA.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DATA / "igloos.sqlite", isolation_level=None)
    db.row_factory = sqlite3.Row
    query("PRAGMA journal_mode=WAL")
    query("PRAGMA foreign_keys=ON")
    db.executescript("""
      CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY,room TEXT NOT NULL,pets TEXT NOT NULL,disclosed INTEGER NOT NULL DEFAULT 0,solved INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS turns(number INTEGER PRIMARY KEY AUTOINCREMENT,session TEXT NOT NULL REFERENCES sessions(id),request_id TEXT NOT NULL,text TEXT NOT NULL,decoded TEXT,encoding TEXT,reply TEXT NOT NULL DEFAULT '',status TEXT NOT NULL,trimmed INTEGER NOT NULL DEFAULT 0,UNIQUE(session,request_id));
      CREATE INDEX IF NOT EXISTS turns_session ON turns(session,number);
    """)
    session_columns = {row[1] for row in query("PRAGMA table_info(sessions)")}
    if "disclosed" not in session_columns:
        query("ALTER TABLE sessions ADD COLUMN disclosed INTEGER NOT NULL DEFAULT 0")
    turn_columns = {row[1] for row in query("PRAGMA table_info(turns)")}
    if "decoded" not in turn_columns:
        query("ALTER TABLE turns ADD COLUMN decoded TEXT")
    if "encoding" not in turn_columns:
        query("ALTER TABLE turns ADD COLUMN encoding TEXT")
    query("UPDATE sessions SET disclosed=1 WHERE solved=1")
    query("UPDATE turns SET status='interrupted' WHERE status IN ('queued','thinking')")
    # Use fresh local connections: the embedded inference HTTP server can retire
    # idle connections between queued turns. Reusing one caused a verified
    # RemoteProtocolError in /apply-template before generation began.
    client = httpx.AsyncClient(timeout=15, limits=httpx.Limits(max_keepalive_connections=0))
    binary = os.environ.get("LLAMA_BINARY", "/opt/llama/llama-server")
    model = os.environ.get("MODEL_FILE", "/opt/model/qwen2.5-1.5b-instruct-q4_k_m.gguf")
    inference = asyncio.create_task(supervise_model([binary, "-m", model, "--host", "127.0.0.1", "--port", "19116", "-c", "4096", "-t", "4", "-np", "1", "-ngl", "0",
        "-b", "256", "-ub", "128", "--seed", "1616", "--no-webui"]))
    work = asyncio.create_task(worker())
    try:
        yield
    finally:
        if active_task:
            active_task.cancel()
        work.cancel()
        inference.cancel()
        await asyncio.gather(work, inference, return_exceptions=True)
        await client.aclose()
        db.close()

app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)

@app.middleware("http")
async def boundaries(request, call_next):
    if request.method not in ["GET", "HEAD"]:
        origin = request.headers.get("origin")
        if origin and origin != ORIGIN:
            return JSONResponse({"detail": "This request belongs to another igloo."}, status_code=403)
        length = request.headers.get("content-length", "0")
        if not length.isdigit() or int(length) > MAX_REQUEST_BYTES:
            return JSONResponse({"detail": "That message is too large."}, status_code=413)
        chunks = []
        received = 0
        async for chunk in request.stream():
            received += len(chunk)
            if received > MAX_REQUEST_BYTES:
                return JSONResponse({"detail": "That message is too large."}, status_code=413)
            chunks.append(chunk)
        # Starlette's cached request forwards this bounded body to the route.
        request._body = b"".join(chunks)
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "same-origin"
    response.headers["Content-Security-Policy"] = "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; media-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'"
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    return response

@app.get("/healthz")
async def health():
    return {"ok": True}

@app.get("/readyz")
async def readiness():
    ready = await model_ready()
    return JSONResponse({"ready": ready}, status_code=200 if ready else 503)

@app.get("/api/state")
async def state(request: Request):
    token = None
    try:
        sid = session_id(request)
    except HTTPException:
        token = secrets.token_urlsafe(32)
        sid = hashlib.sha256(token.encode()).hexdigest()
        query("INSERT INTO sessions(id,room,pets) VALUES (?,?,?)", (sid, json.dumps(DEFAULT_ROOM), json.dumps(DEFAULT_PETS)))
    result = get_state(sid)
    result["ready"] = await model_ready()
    response = JSONResponse(result)
    if token:
        response.set_cookie(COOKIE, token, httponly=True, samesite="strict", secure=os.environ.get("COOKIE_SECURE") == "true", max_age=60*60*24*30)
    return response

class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")

class Chat(StrictModel):
    text: str = Field(min_length=1, max_length=74000)
    request_id: UUID

@app.post("/api/chat")
async def chat(body: Chat, request: Request):
    sid = session_id(request)
    rid = str(body.request_id)
    text = body.text.strip()
    if not text:
        raise HTTPException(422, "Write a message first.")
    try:
        decoded = decode_message(text)
    except ProtocolError as exc:
        raise HTTPException(422, str(exc)) from exc
    previous = query("SELECT text,status,encoding FROM turns WHERE session=? AND request_id=?", (sid, rid)).fetchone()
    if previous:
        if previous["text"] != text:
            raise HTTPException(409, "That message identifier has already been used.")
        return {"request_id": rid, "status": previous["status"], "encoding": previous["encoding"]}
    if query("SELECT 1 FROM turns WHERE session=? AND status IN ('queued','thinking')", (sid,)).fetchone():
        raise HTTPException(409, "Pip is still answering your last message.")
    if queue.full():
        raise HTTPException(503, "Pip is busy. Your message is still in the chat box; try again shortly.")
    if not await model_ready():
        raise HTTPException(503, "Pip's translator is warming up. Your message is saved in the chat box.")
    try:
        count = await tokens(model_message(decoded.text, decoded.encoding))
    except httpx.HTTPError:
        raise HTTPException(503, "Pip's translator is reconnecting. Your message is still in the chat box.")
    if count > 1024:
        raise HTTPException(422, "That message is too long for Pip to read. Try a shorter message.")
    # Tokenization awaited: recheck the per-session invariant before committing.
    previous = query("SELECT text,status,encoding FROM turns WHERE session=? AND request_id=?", (sid, rid)).fetchone()
    if previous:
        if previous["text"] != text:
            raise HTTPException(409, "That message identifier has already been used.")
        return {"request_id": rid, "status": previous["status"], "encoding": previous["encoding"]}
    if query("SELECT 1 FROM turns WHERE session=? AND status IN ('queued','thinking')", (sid,)).fetchone():
        raise HTTPException(409, "Pip is still answering your last message.")
    if queue.full():
        raise HTTPException(503, "Pip is busy. Try again shortly.")
    try:
        query("INSERT INTO turns(session,request_id,text,decoded,encoding,status) VALUES (?,?,?,?,?,'queued')", (sid, rid, text, decoded.text, decoded.encoding))
    except sqlite3.IntegrityError:
        raise HTTPException(409, "That message has already been accepted.")
    key = (sid, rid)
    waiting.append(key)
    queue.put_nowait(key)
    return {"request_id": rid, "status": "queued", "encoding": decoded.encoding}

@app.get("/api/chat/{rid}/events")
async def events(rid: UUID, request: Request):
    sid = session_id(request)
    key = (sid, str(rid))
    if not query("SELECT 1 FROM turns WHERE session=? AND request_id=?", key).fetchone():
        raise HTTPException(404, "Message not found.")
    async def stream():
        last = None
        while True:
            if await request.is_disconnected():
                return
            row = query("SELECT reply,status,trimmed FROM turns WHERE session=? AND request_id=?", key).fetchone()
            if row is None:
                yield "event: reset\ndata: {}\n\n"
                return
            value = dict(row)
            value["position"] = waiting.index(key)+1 if key in waiting else 0
            serialized = json.dumps(value)
            if serialized != last:
                yield "data: " + serialized + "\n\n"
                last = serialized
            if row["status"] not in ["queued", "thinking"]:
                return
            await asyncio.sleep(.15)
    return StreamingResponse(stream(), media_type="text/event-stream", headers={"X-Accel-Buffering": "no"})

@app.post("/api/chat/{rid}/cancel")
async def cancel(rid: UUID, request: Request):
    key = (session_id(request), str(rid))
    if not query("SELECT 1 FROM turns WHERE session=? AND request_id=?", key).fetchone():
        raise HTTPException(404, "Message not found.")
    query("UPDATE turns SET status='cancelled' WHERE session=? AND request_id=? AND status IN ('thinking','queued')", key)
    if key in waiting:
        waiting.remove(key)
    if active == key and active_task:
        active_task.cancel()
    return {"ok": True}

class Furniture(StrictModel):
    kind: Literal["sofa", "chair", "rug", "plant", "stereo", "bed", "bowl", "toy"]
    x: float = Field(ge=170, le=580, allow_inf_nan=False)
    y: float = Field(ge=245, le=415, allow_inf_nan=False)
    rotation: int = Field(ge=0, le=3)

class Room(StrictModel):
    color: Literal["blue", "red", "green", "purple", "orange", "pink"]
    furniture: list[Furniture] = Field(max_length=8)

@app.put("/api/room")
async def room(body: Room, request: Request):
    sid = session_id(request)
    if len({f.kind for f in body.furniture}) != len(body.furniture):
        raise HTTPException(422, "Your inventory has one of each furniture item.")
    query("UPDATE sessions SET room=? WHERE id=?", (body.model_dump_json(), sid))
    return {"room": body.model_dump()}

class Care(StrictModel):
    action: Literal["feed", "play", "rest"]

@app.post("/api/puffle/{pet}/care")
async def care(pet: Literal["pip", "bubbles", "pebble"], body: Care, request: Request):
    sid = session_id(request)
    pets = json.loads(query("SELECT pets FROM sessions WHERE id=?", (sid,)).fetchone()[0])
    stat = {"feed": "food", "play": "play", "rest": "energy"}[body.action]
    pets[pet][stat] = min(100, pets[pet][stat]+25)
    query("UPDATE sessions SET pets=? WHERE id=?", (json.dumps(pets), sid))
    return {"pets": pets, "pet": pet, "action": body.action}

class Claim(StrictModel):
    code: str = Field(max_length=200)

@app.post("/api/claim")
async def claim(body: Claim, request: Request):
    sid = session_id(request)
    correct = secrets.compare_digest(body.code.encode(), FLAG.encode())
    if correct:
        query("UPDATE sessions SET disclosed=1,solved=1 WHERE id=?", (sid,))
    return {"correct": correct}

class Reset(StrictModel):
    scope: Literal["conversation", "room"]
    confirmed: bool = False

@app.post("/api/reset")
async def reset(body: Reset, request: Request):
    sid = session_id(request)
    if not body.confirmed:
        raise HTTPException(422, "Confirm the reset first.")
    if query("SELECT 1 FROM turns WHERE session=? AND status IN ('queued','thinking')", (sid,)).fetchone():
        raise HTTPException(409, "Cancel Pip's reply before resetting.")
    query("DELETE FROM turns WHERE session=?", (sid,))
    if body.scope == "room":
        query("UPDATE sessions SET room=?,pets=? WHERE id=?", (json.dumps(DEFAULT_ROOM), json.dumps(DEFAULT_PETS), sid))
    return get_state(sid)

@app.get("/api/export")
async def export(request: Request):
    state = get_state(session_id(request))
    lines = ["Waddles and Pip — igloo conversation", ""]
    for turn in state["turns"]:
        label = f" [Gary's Translator · {LABELS[turn['encoding']]}]" if turn["encoding"] else ""
        lines.extend(["Waddles" + label + ": " + turn["text"], "Pip: " + turn["reply"], "[" + turn["status"] + "]", ""])
    return Response("\n".join(lines), media_type="text/plain; charset=utf-8", headers={"Content-Disposition": 'attachment; filename="pip-conversation.txt"'})

@app.get("/")
async def index():
    return FileResponse(PUBLIC / "index.html")

@app.get("/{file}")
async def public_file(file: str):
    if file not in ["app.js", "style.css"]:
        raise HTTPException(404)
    return FileResponse(PUBLIC / file)

app.mount("/assets", StaticFiles(directory=PUBLIC / "assets"), name="assets")
