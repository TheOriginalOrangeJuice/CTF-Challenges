#!/bin/sh
# Runs at container start (via nginx's /docker-entrypoint.d) to build the web root
# with this instance's flag committed into git history.
set -eu

[ -n "${FLAG:-}" ] || FLAG='CTF{g1t_h1st0ry_n3v3r_f0rg3ts_wh4t_y0u_d3l3t3d}'

rm -rf /tmp/www
HOME=/tmp /opt/build_repo.sh "$FLAG" /opt/site /tmp/www >/dev/null
echo "$0: web root built at /tmp/www"
