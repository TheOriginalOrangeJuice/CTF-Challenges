#!/usr/bin/env sh
# Expose the challenge over a netcat-style TCP service.
#
#   player connects with:   nc <host> 1337
#
# Each connection gets its own forked process with its CWD set to the
# directory holding the REAL flag.txt. Requires socat:
#   Debian/Ubuntu: apt-get install -y socat
#   Fedora:        dnf install -y socat
#
# Override the port with:  PORT=4000 ./serve.sh

PORT="${PORT:-1337}"
HERE="$(cd "$(dirname "$0")" && pwd)"

# Run from the directory that contains the binary + the real flag.txt.
cd "$HERE/.."

if [ ! -f flag.txt ]; then
    echo "WARNING: no flag.txt in $(pwd) -- players will get an error." >&2
fi

echo "Serving ./double_it on 0.0.0.0:$PORT  (Ctrl-C to stop)"
exec socat -T60 \
    TCP-LISTEN:"$PORT",reuseaddr,fork \
    EXEC:"./double_it",stderr
