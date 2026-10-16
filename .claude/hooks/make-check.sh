#!/bin/sh
# SubagentStop gate for the implementer agent: it finishes only with a green `make check`.
# A final message that starts with "BLOCKED:" passes, so a stuck agent can still report why.

input=$(cat)
prefix=$(printf '%s' "$input" | bun -e '
  const input = await Bun.stdin.json()
  console.log(String(input.last_assistant_message ?? "").trimStart().slice(0, 8))
')
[ "$prefix" = "BLOCKED:" ] && exit 0

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 1
if output=$(NO_COLOR=1 FORCE_COLOR=0 make check 2>&1); then
  exit 0
fi

{
  echo "make check is red. Fix it before finishing, or start your final message with BLOCKED:"
  echo "and explain why the step cannot be finished. Last 60 lines:"
  echo
  printf '%s\n' "$output" | tail -n 60
} >&2
exit 2
