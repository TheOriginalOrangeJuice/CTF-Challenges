#!/bin/sh
# Builds the web root's git history at image build time.
# The flag is committed in .env and then "removed" -- it survives only in history.
set -eu

FLAG="$1"
SRC="$2"   # finished site files
OUT="$3"   # web root to create

export GIT_AUTHOR_NAME="devops-dan" GIT_AUTHOR_EMAIL="dan@everything-to-shell.internal"
export GIT_COMMITTER_NAME="$GIT_AUTHOR_NAME" GIT_COMMITTER_EMAIL="$GIT_AUTHOR_EMAIL"

commit() {
    export GIT_AUTHOR_DATE="$1" GIT_COMMITTER_DATE="$1"
    git add -A
    git commit -q -m "$2"
}

mkdir -p "$OUT"
cd "$OUT"
git init -q -b main
git config core.fileMode false

sed "s/v2.3.1/v2.2.0/" "$SRC/index.html" > index.html
cp "$SRC/style.css" .
commit "2026-09-14T10:02:11Z" "init landing page"

cat > .env <<ENV
# sandbox orchestrator config
NSJAIL_BIN=/usr/bin/nsjail
SANDBOX_TIMEOUT=10
SANDBOX_NET=none
ORCHESTRATOR_URL=http://10.13.37.5:8080
ORCHESTRATOR_TOKEN=etsh_live_9f8a1c77d2b04e6aa1f3
FLAG=$FLAG
ENV
commit "2026-09-15T23:48:57Z" "wire up sandbox orchestrator config"

cp "$SRC/shell.js" .
commit "2026-09-17T14:20:30Z" "add python/node/php terminals"

git rm -q --cached .env
rm .env
printf '.env\n*.log\n' > .gitignore
commit "2026-09-18T08:05:42Z" "remove .env from repo, oops"

cp "$SRC/robots.txt" "$SRC/flag.txt" .
commit "2026-09-21T17:33:09Z" "robots.txt"

cp "$SRC/index.html" "$SRC/style.css" "$SRC/shell.js" .
commit "2026-10-02T11:12:58Z" "ui polish, bump to v2.3.1"

# Leave objects loose (no gc/pack) so they're fetchable by path.
git log --oneline
