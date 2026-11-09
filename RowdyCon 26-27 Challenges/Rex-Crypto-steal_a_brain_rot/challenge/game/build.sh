#!/usr/bin/env bash
# =============================================================================
# game/build.sh - compile Steal-a-Brain-Rot (C + raylib) to WebAssembly.
#
# Run from the REPO ROOT:
#     ./game/build.sh
#
# Output: server/static/index.html + game.js + game.wasm  (Flask serves these)
#
# -----------------------------------------------------------------------------
# Prerequisites
# -----------------------------------------------------------------------------
# 1. Emscripten SDK (emcc on PATH).  In Docker use the official image:
#        FROM emscripten/emsdk:3.1.64 AS gamebuild
#
# 2. raylib compiled FOR THE WEB (a static lib built with emcc).  Two options:
#
#    (a) Build from source inside the build stage (recommended, ~1 min):
#        RUN git clone --depth 1 --branch 5.5 https://github.com/raysan5/raylib.git /opt/raylib \
#         && cd /opt/raylib/src \
#         && make PLATFORM=PLATFORM_WEB -B -j"$(nproc)"
#        This produces /opt/raylib/src/libraylib.web.a  (older versions: libraylib.a)
#        and the header /opt/raylib/src/raylib.h.
#        Then:  ENV RAYLIB_DIR=/opt/raylib/src
#
#    (b) Drop a prebuilt web libraylib.a + raylib.h into game/vendor/raylib/
#        (e.g. from a raylib release's "raylib-<ver>_webassembly.zip").
#        Then:  RAYLIB_DIR=game/vendor/raylib ./game/build.sh
#
# Environment overrides:
#   RAYLIB_DIR       directory containing raylib.h and the web static lib
#   RAYLIB_WEB_LIB   explicit path to the static lib (skips auto-detection)
#   OUT_DIR          defaults to server/static
# =============================================================================
set -euo pipefail

cd "$(dirname "$0")/.."              # -> repo root regardless of invocation dir
REPO_ROOT="$(pwd)"

RAYLIB_DIR="${RAYLIB_DIR:-${REPO_ROOT}/game/vendor/raylib}"
OUT_DIR="${OUT_DIR:-${REPO_ROOT}/server/static}"

if ! command -v emcc >/dev/null 2>&1; then
    echo "error: emcc not found on PATH. Install/activate the Emscripten SDK." >&2
    exit 1
fi

# Locate the web build of raylib.
if [[ -z "${RAYLIB_WEB_LIB:-}" ]]; then
    for cand in "${RAYLIB_DIR}/libraylib.web.a" "${RAYLIB_DIR}/libraylib.a" \
                "${RAYLIB_DIR}/lib/libraylib.a" "${RAYLIB_DIR}/src/libraylib.web.a" \
                "${RAYLIB_DIR}/src/libraylib.a"; do
        if [[ -f "$cand" ]]; then RAYLIB_WEB_LIB="$cand"; break; fi
    done
fi
if [[ -z "${RAYLIB_WEB_LIB:-}" || ! -f "${RAYLIB_WEB_LIB}" ]]; then
    echo "error: could not find a web libraylib.a under RAYLIB_DIR=${RAYLIB_DIR}" >&2
    echo "       set RAYLIB_DIR or RAYLIB_WEB_LIB (see comments at top of this script)." >&2
    exit 1
fi

RAYLIB_INC="$(dirname "${RAYLIB_WEB_LIB}")"
[[ -f "${RAYLIB_INC}/raylib.h" ]] || RAYLIB_INC="${RAYLIB_DIR}"
[[ -f "${RAYLIB_INC}/raylib.h" ]] || RAYLIB_INC="${RAYLIB_DIR}/include"
[[ -f "${RAYLIB_INC}/raylib.h" ]] || RAYLIB_INC="${RAYLIB_DIR}/src"
if [[ ! -f "${RAYLIB_INC}/raylib.h" ]]; then
    echo "error: raylib.h not found near ${RAYLIB_WEB_LIB}" >&2
    exit 1
fi

mkdir -p "${OUT_DIR}"

echo "emcc:        $(emcc --version | head -n1)"
echo "raylib lib:  ${RAYLIB_WEB_LIB}"
echo "raylib inc:  ${RAYLIB_INC}"
echo "output:      ${OUT_DIR}/index.html"

# -----------------------------------------------------------------------------
# Compile + link
#   -sUSE_GLFW=3           raylib's web platform uses GLFW via emscripten
#   -sASYNCIFY             lets net.c block on `await fetch()` (EM_ASYNC_JS)
#   -sALLOW_MEMORY_GROWTH  don't hard-cap the heap
#   -sASYNCIFY_STACK_SIZE  raylib draw calls nest a bit; give asyncify room
#   --shell-file           our dark themed shell (has #flag-out for the flag)
#   -o .../index.html      also emits index.js + index.wasm next to it
# -----------------------------------------------------------------------------
emcc \
    "${REPO_ROOT}"/game/src/*.c \
    -I"${RAYLIB_INC}" \
    "${RAYLIB_WEB_LIB}" \
    -std=gnu11 -O2 -Wall -Wextra -Wno-unused-parameter \
    -DPLATFORM_WEB \
    -sUSE_GLFW=3 \
    -sASYNCIFY \
    -sASYNCIFY_STACK_SIZE=65536 \
    -sALLOW_MEMORY_GROWTH \
    -sENVIRONMENT=web \
    -sEXPORTED_RUNTIME_METHODS=UTF8ToString,stringToNewUTF8 \
    --preload-file "${REPO_ROOT}/game/assets/sahoor.png@assets/sahoor.png" \
    --shell-file "${REPO_ROOT}/game/shell.html" \
    -o "${OUT_DIR}/index.html"

echo "ok: built ${OUT_DIR}/index.html (+ index.js, index.wasm)"
