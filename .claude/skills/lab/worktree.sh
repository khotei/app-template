#!/bin/sh
# Sets up a worktree, run inside it by `make worktree N=<n> NAME=<name> [KEEP=1]`: the branch
# wt/<name> (with KEEP=1 the branch stays, for a worktree on a ticket branch), a symlink <name>
# beside the folder, its .env (the main tree's with the TCP ports and the stage of number N:
# docs/knowledge/tooling.md › Worktrees) and its dependencies. Every step is safe to repeat, so a
# rerun with the same N finishes a run that failed midway.
set -eu
N=$1
NAME=$2
KEEP=${3:-}
refuse() { printf 'refused: %s\n' "$1" >&2; exit 1; }
# A leading zero would read as octal.
case $N in '' | *[!0-9]* | 0*) refuse 'N counts worktrees from 1; the main tree is 0' ;; esac
common=$(git rev-parse --path-format=absolute --git-common-dir)
main=$(dirname "$common")
[ ! "$main" -ef . ] || refuse 'this is the main tree, the source of every .env'
stage="STAGE=\"local$N\""
# Two trees on one N would share the TCP ports and, through the stage, the database.
trees=$(git worktree list --porcelain)
printf '%s\n' "$trees" | sed -n 's/^worktree //p' | while IFS= read -r tree; do
  [ "$tree" -ef . ] || ! grep -qxF "$stage" "$tree/.env" 2> /dev/null ||
    refuse "N=$N is already the stage in $tree/.env"
done
[ -n "$KEEP" ] || git branch -m "wt/$NAME"
here=$(basename "$PWD")
[ "$here" = "$NAME" ] || [ -L "../$NAME" ] || ln -s "$here" "../$NAME"
moved='API_PORT|WEB_PORT|WORKER_PORT|GRAFANA_PORT|RDS_BASE_PORT|AWS_ENDPOINT_URL|OTEL_EXPORTER_OTLP_ENDPOINT|STAGE'
{
  sed -E "/^($moved)=/d" "$main/.env"
  cat << EOF
API_PORT=$((3000 + 10 * N))
WEB_PORT=$((3001 + 10 * N))
WORKER_PORT=$((3002 + 10 * N))
GRAFANA_PORT=$((3003 + 10 * N))
RDS_BASE_PORT=$((15432 + 10 * N))
AWS_ENDPOINT_URL="http://localhost:$((4566 + 10 * N))"
OTEL_EXPORTER_OTLP_ENDPOINT="http://localhost:$((4318 + 10 * N))"
$stage
EOF
} > .env
bun install
