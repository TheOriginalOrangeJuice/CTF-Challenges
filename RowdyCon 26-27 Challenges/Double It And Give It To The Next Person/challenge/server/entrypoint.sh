#!/usr/bin/env sh
set -eu

PORT="${PORT:-1337}"
FLAG="${FLAG:-flag{placeholder_set_the_FLAG_env_var}}"

cd /chal
printf '%s\n' "$FLAG" > /chal/flag.txt

echo "Serving double_it on 0.0.0.0:$PORT"
exec socat -T60 \
    TCP-LISTEN:"$PORT",reuseaddr,fork \
    EXEC:"/chal/double_it",stderr
