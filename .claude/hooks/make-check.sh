#!/bin/sh
# SubagentStop gate for the implementer agent: it finishes only with a green `make check` in the
# tree of its cwd, which for an agent started with `isolation: worktree` is not CLAUDE_PROJECT_DIR.
# A final message that starts with "BLOCKED:", plain or behind Markdown markers (`**BLOCKED:**`,
# `## BLOCKED:`, `> BLOCKED:`), passes, so a stuck agent can still report why.
# shellcheck disable=SC2016 # the quoted text is a program for bun; the shell expands none of it
cwd=$(bun -e '
  const input = await Bun.stdin.json()
  if (/^[#>*_`\s]*BLOCKED[*_`]*:/.test(input.last_assistant_message)) process.exit(3)
  console.log(input.cwd)
')
[ $? -ne 3 ] || exit 0
if dir=$(git -C "$cwd" rev-parse --show-toplevel) && cd "$dir" &&
  output=$(NO_COLOR=1 make check 2>&1); then
  exit 0
fi
{
  echo "make check is red in '$dir'. Fix it before finishing, or start your final message with"
  echo "BLOCKED: and explain why the step cannot be finished. Last 60 lines:"
  printf '%s\n' "$output" | tail -n 60
} >&2
exit 2
