#!/bin/sh
# Write the configured flag into place at container start, then launch the app.
# Set FLAG via `docker compose` env / `-e FLAG=...`. Falls back to the baked
# /flag.txt if FLAG is unset.
set -e
if [ -n "$FLAG" ]; then
  printf '%s\n' "$FLAG" > /flag.txt
  echo "[entrypoint] flag set from \$FLAG (${#FLAG} chars)"
else
  echo "[entrypoint] \$FLAG unset; using baked /flag.txt"
fi
exec python app.py
