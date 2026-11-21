#!/bin/sh
# Postgres MCP Pro on the database of the tree this file lives in: each worktree's .env.pulumi
# names its own TCP port, so the one .mcp.json entry reaches the right database in every tree.
# Read-only (--access-mode=restricted); schema changes stay with make migration. The image maps
# localhost to the host itself. set -eu: without the file `make up` writes, nothing starts.
set -eu
root=$(cd "$(dirname "$0")/../.." && pwd -P)
DATABASE_URI=$(sed -n 's/^DATABASE_URL=//p' "$root/.env.pulumi")
export DATABASE_URI
# --init: the server as PID 1 ignores SIGTERM and stdin's end, so without it a closed session
# leaves its container running. The label lets make reset remove what a killed session left.
exec docker run -i --rm --init --label "app-template.mcp-tree=$root" -e DATABASE_URI \
  crystaldba/postgres-mcp:0.3.0@sha256:dbbd346860d29f1543e991f30f3284bf4ab5f096d049ecc3426528f20b1b6e6b \
  --access-mode=restricted
