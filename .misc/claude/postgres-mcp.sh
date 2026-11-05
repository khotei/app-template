#!/bin/sh
# Postgres MCP Pro on the database of the tree this file lives in: each worktree's .env.pulumi
# names its own port, so the one .mcp.json entry reaches the right database in every tree.
# Read-only (--access-mode=restricted); schema changes stay with make migration.
set -eu
root=$(cd "$(dirname "$0")/../.." && pwd -P)
env_file="$root/.env.pulumi"
[ -f "$env_file" ] || { echo "postgres-mcp: no $env_file; run make up first" >&2; exit 1; }
url=$(sed -n 's/^DATABASE_URL=//p' "$env_file" | tr -d '"')
[ -n "$url" ] || { echo "postgres-mcp: no DATABASE_URL in $env_file" >&2; exit 1; }
# The server runs in a container, where localhost is the container itself.
DATABASE_URI=$(printf '%s' "$url" | sed -E 's#@(localhost|127\.0\.0\.1):#@host.docker.internal:#')
export DATABASE_URI
# --init: the server as PID 1 ignores SIGTERM and stdin's end, so without it a closed session
# leaves its container running. The label lets make reset remove what a killed session left.
exec docker run -i --rm --init --label "app-template.mcp-tree=$root" -e DATABASE_URI \
  crystaldba/postgres-mcp:0.3.0@sha256:dbbd346860d29f1543e991f30f3284bf4ab5f096d049ecc3426528f20b1b6e6b \
  --access-mode=restricted
