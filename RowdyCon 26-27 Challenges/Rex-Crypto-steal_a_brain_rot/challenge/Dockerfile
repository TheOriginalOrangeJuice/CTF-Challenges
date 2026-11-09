# syntax=docker/dockerfile:1
# =============================================================================
# Steal-a-Brain-Rot — multi-stage build
#   Stage 1 (gamebuild): Emscripten + raylib-for-web -> compile C game to wasm
#   Stage 2 (runtime):   Flask + gunicorn, serving the built game + the API
# =============================================================================

# ---- Stage 1: build the WebAssembly game ----------------------------------
# Pinned by the digest of emscripten/emsdk:latest's multi-arch manifest list:
# reproducible AND resolves per-architecture (arm64 on Apple Silicon dev
# machines, amd64 on x86 CTF infra). The version tags (e.g. 3.1.64) are
# amd64-only, which breaks native builds on arm64; this digest avoids that.
FROM emscripten/emsdk@sha256:fb7864e398acfda863dfcea78b8bc8adad359fa60c6a0bbeb845931de64aa68a AS gamebuild

# git is needed to fetch raylib; build-essential/make ship in the emsdk image.
RUN apt-get update && apt-get install -y --no-install-recommends git \
 && rm -rf /var/lib/apt/lists/*

# Build raylib for the web (produces libraylib.web.a + raylib.h in src/).
RUN git clone --depth 1 --branch 5.5 https://github.com/raysan5/raylib.git /opt/raylib \
 && make -C /opt/raylib/src PLATFORM=PLATFORM_WEB -B -j"$(nproc)"
ENV RAYLIB_DIR=/opt/raylib/src

WORKDIR /build
# Only the game sources are needed to build the wasm bundle.
COPY game ./game
# build.sh cd's to repo root (=/build) and writes into server/static.
RUN chmod +x ./game/build.sh && ./game/build.sh
# -> /build/server/static/{index.html,index.js,index.wasm}

# ---- Stage 2: Flask runtime ------------------------------------------------
# python:3.12-slim so mimetypes maps .wasm -> application/wasm (added in 3.12),
# enabling WebAssembly stream-compilation in the browser.
FROM python:3.12-slim AS runtime

WORKDIR /app

# Install Python deps first for layer caching.
COPY server/requirements.txt /app/server/requirements.txt
RUN pip install --no-cache-dir -r /app/server/requirements.txt

# Backend code + the server-authoritative flag (read from repo-root flag.txt).
COPY server /app/server
COPY flag.txt /app/flag.txt

# The compiled game bundle from stage 1.
COPY --from=gamebuild /build/server/static /app/server/static

EXPOSE 8080

# app.py imports `crypto` and `tokens` as top-level modules, so run from the
# server dir. _REPO_ROOT resolves to /app, where flag.txt lives.
WORKDIR /app/server
# --preload is REQUIRED: crypto._KEY and the default token secret are generated
# once at import. Preloading imports the app in the gunicorn master and forks
# workers from it, so every worker shares the same AES key + signing secret.
# Without it, each worker would have a different key and the ECB oracle would be
# inconsistent across requests, breaking the byte-at-a-time attack.
CMD ["gunicorn", "--preload", "--bind", "0.0.0.0:8080", "--workers", "2", "--timeout", "120", "app:app"]
