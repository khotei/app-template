#!/bin/sh
# Feeds .claude/hooks/make-check.sh one SubagentStop input per case, with a stub `make` on PATH
# that exits as the case asks, and prints `PASS` or `FAIL` per case with the exit code and the
# first line the hook printed. Run from the repo root: `sh <ticket>/hook-cases.sh [case…]`; no
# case runs them all; `SH=dash` runs the hook with dash. Exits 1 when any case named fails.
root=$(git rev-parse --show-toplevel) || exit 2
hook=$root/.claude/hooks/make-check.sh
tmp=$(mktemp -d) || exit 2
trap 'rm -r -f "$tmp"' EXIT
# dash runs no EXIT trap on a signal, but does on the exit its trap makes.
trap 'exit 2' HUP INT TERM
printf '#!/bin/sh\necho "stub make in $PWD"\nexit "${STUB_RC:-1}"\n' > "$tmp/make"
chmod +x "$tmp/make"
failed=0

# case <id> <stub make exit> <expected exit> <expected text in the output, or -> <input JSON>
case_() {
  printf '%s' "$5" | STUB_RC=$2 PATH="$tmp:$PATH" CLAUDE_PROJECT_DIR=$root "${SH:-sh}" "$hook" > "$tmp/out" 2>&1
  got=$?
  if [ "$got" = "$3" ] && { [ "$4" = - ] || grep -qF -- "$4" "$tmp/out"; }; then verdict=PASS; else
    verdict=FAIL
    failed=1
  fi
  first=$(head -n 1 "$tmp/out")
  printf '%s %s: exit %s (expected %s) — %s\n' "$verdict" "$1" "$got" "$3" "$first"
}

run() {
  case $1 in
    blocked) case_ "$1" 1 0 - '{"last_assistant_message":"BLOCKED: no way","cwd":"'"$root"'"}' ;;
    blocked-bold) case_ "$1" 1 0 - '{"last_assistant_message":"**BLOCKED:** no way","cwd":"'"$root"'"}' ;;
    blocked-heading) case_ "$1" 1 0 - '{"last_assistant_message":"## BLOCKED: no way","cwd":"'"$root"'"}' ;;
    blocked-mid) case_ "$1" 1 2 'make check is red' '{"last_assistant_message":"Not BLOCKED: done","cwd":"'"$root"'"}' ;;
    red) case_ "$1" 1 2 'make check is red' '{"last_assistant_message":"done","cwd":"'"$root"'"}' ;;
    green) case_ "$1" 0 0 - '{"last_assistant_message":"done","cwd":"'"$root"'"}' ;;
    cwd-missing) case_ "$1" 0 2 "cannot find the agent's git tree" '{"last_assistant_message":"done","cwd":"/nonexistent"}' ;;
    cwd-absent) case_ "$1" 0 2 "cannot find the agent's git tree" '{"last_assistant_message":"done"}' ;;
    *) printf 'unknown case: %s\n' "$1" >&2; exit 2 ;;
  esac
}

if [ $# -eq 0 ]; then set -- blocked blocked-bold blocked-heading blocked-mid red green cwd-missing cwd-absent; fi
for c in "$@"; do run "$c"; done
exit "$failed"
