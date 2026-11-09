"""Run the actual app in an isolated Condev data directory for validation."""
import argparse
import os
from pathlib import Path
import subprocess
import sys

parser = argparse.ArgumentParser()
parser.add_argument("data", type=Path)
parser.add_argument("--without-model", action="store_true", help="Exercise the real translator-unavailable UI; no substitute replies.")
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
env = dict(os.environ)
env.update(dict(line.split("=", 1) for line in (root / "organizer/event.env").read_text().splitlines() if "=" in line and not line.startswith("#")))
env.update(DATA_DIR=str(args.data), PUBLIC_ORIGIN="http://127.0.0.1:18116", PYTHONDONTWRITEBYTECODE="1",
           LLAMA_BINARY="/bin/false" if args.without_model else "/tmp/puffle-runtime-20261103/llama/llama-b10566/llama-server",
           MODEL_FILE="/tmp/puffle-runtime-20261103/qwen2.5-1.5b-instruct-q4_k_m.gguf")
raise SystemExit(subprocess.call([sys.executable, "-m", "uvicorn", "app:app", "--app-dir", str(root / "challenge/server"), "--host", "127.0.0.1", "--port", "18116", "--no-access-log"], env=env))
