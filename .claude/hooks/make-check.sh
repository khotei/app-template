#!/bin/sh
# SubagentStop gate for the implementer agent: it finishes only with a green `make check`.
# A final message that starts with "BLOCKED:", plain or behind Markdown markers (`**BLOCKED:**`,
# `## BLOCKED:`, `> BLOCKED:`), passes, so a stuck agent can still report why.

# One read of the input: exit 3 for a BLOCKED: message, else print the agent's cwd.
cwd=$(bun -e '
  const input = await Bun.stdin.json()
  if (/^[#>*_`\s]*BLOCKED[*_`]*:/.test(String(input.last_assistant_message ?? ""))) process.exit(3)
  console.log(input.cwd ?? "")
')
read_exit=$?
[ "$read_exit" -eq 3 ] && exit 0
if [ "$read_exit" -ne 0 ]; then
  printf 'make-check.sh could not read its input (bun exit %s), so make check did not run.\n' "$read_exit" >&2
  exit 2
fi

# The agent's own tree or none: an agent started with `isolation: worktree` works outside
# CLAUDE_PROJECT_DIR, so a missing cwd never falls back to it. `git -C ""` runs in the current folder.
if [ -z "$cwd" ] || ! dir=$(git -C "$cwd" rev-parse --show-toplevel 2>/dev/null) || ! cd "$dir" 2>/dev/null; then
  {
    printf "make-check.sh cannot find the agent's git tree (cwd: %s), so make check did not run.\n" "$cwd"
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
