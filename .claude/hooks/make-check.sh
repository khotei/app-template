#!/bin/sh
# SubagentStop gate for the implementer agent: it finishes only with a green `make check`.
# A final message that starts with "BLOCKED:" passes, so a stuck agent can still report why.

input=$(cat)
prefix=$(printf '%s' "$input" | bun -e '
  const input = await Bun.stdin.json()
  console.log(String(input.last_assistant_message ?? "").trimStart().slice(0, 8))
')
[ "$prefix" = "BLOCKED:" ] && exit 0

# The agent's own tree: an agent started with `isolation: worktree` works outside CLAUDE_PROJECT_DIR.
cwd=$(printf '%s' "$input" | bun -e 'console.log((await Bun.stdin.json()).cwd ?? "")')
dir=$(git -C "${cwd:-${CLAUDE_PROJECT_DIR:-.}}" rev-parse --show-toplevel 2>/dev/null)
if ! cd "$dir" 2>/dev/null; then
  {
    echo "make-check.sh cannot find the agent's git tree (cwd: $cwd), so make check did not run."
    echo "Fix it before finishing, or start your final message with BLOCKED: and explain why."
  } >&2
  exit 2
fi
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
