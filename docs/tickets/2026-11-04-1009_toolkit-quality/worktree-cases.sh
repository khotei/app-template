#!/bin/sh
# Runs .claude/skills/ticket-implement/worktree.sh in a throwaway repository with two linked
# worktrees, `live` already set up as N=1 and `next` new, with a stub `bun` on PATH, and prints
# `PASS` or `FAIL` per case with the exit code and the last line the script printed. Run from the
# repo root: `sh <ticket>/worktree-cases.sh`. The cases run in order, each on the state the one
# before it left. Exits 1 when any case fails.
script=$(git rev-parse --show-toplevel)/.claude/skills/ticket-implement/worktree.sh || exit 2
tmp=$(mktemp -d) || exit 2
trap 'rm -r -f "$tmp"' EXIT
mkdir "$tmp/bin"
printf '#!/bin/sh\necho stub bun\n' > "$tmp/bin/bun"
chmod +x "$tmp/bin/bun"
main=$tmp/main
{
  git init -q "$main" &&
    git -C "$main" -c user.name=t -c user.email=t@t commit -q --allow-empty -m init &&
    git -C "$main" worktree add -q -b wt/live "$main/.claude/worktrees/live" &&
    git -C "$main" worktree add -q -b agent-x "$main/.claude/worktrees/agent-x"
} || exit 2
printf '%s\n' API_PORT=3000 WEB_PORT=3001 'AWS_ENDPOINT_URL="http://localhost:4566"' \
  'STAGE="local"' RDS_BASE_PORT=15432 > "$main/.env"
sed -e 's/=3000/=3010/' -e 's/=3001/=3011/' -e 's/4566/4576/' -e 's/"local"/"local1"/' \
  -e 's/=15432/=15442/' "$main/.env" > "$main/.claude/worktrees/live/.env"
failed=0

# case <id> <dir> <N> <NAME> <expected exit> <expected API_PORT in dir's .env after, or ->
case_() {
  (cd "$2" && PATH="$tmp/bin:$PATH" sh "$script" "$3" "$4") > "$tmp/out" 2>&1
  got=$?
  port=$(sed -n 's/^API_PORT=//p' "$2/.env" 2>/dev/null)
  if [ "$got" = "$5" ] && { [ "$6" = - ] || [ "$port" = "$6" ]; }; then verdict=PASS; else
    verdict=FAIL
    failed=1
  fi
  echo "$verdict $1: exit $got (expected $5), API_PORT ${port:-none} — $(tail -n 1 "$tmp/out")"
}

next=$main/.claude/worktrees/agent-x
case_ main-tree "$main" 2 x-S1-a 1 3000
case_ n-taken "$next" 1 x-S1-a 1 -
case_ n-too-big "$next" 5011 x-S1-a 1 -
case_ n-overflow "$next" 922337203685477580 x-S1-a 1 -
case_ n-free "$next" 2 x-S1-a 0 3020
case_ n-rerun "$next" 2 x-S1-a 0 3020
case_ n-renumber "$next" 3 x-S1-a 1 3020
exit $failed
