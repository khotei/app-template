#!/bin/sh
# The implementer's gate: it hands back its report only with a green `make check` in the tree of
# its cwd, the directory of the session that spawned it (or its own worktree), not always
# CLAUDE_PROJECT_DIR. The agent wires it twice: as a Stop hook (SubagentStop), which holds in
# manual mode, and as a PreToolUse hook on SubagentHandback, the tool that delivers the report in
# auto mode, where a SubagentStop block is ignored and carries no report. A report that starts
# with "BLOCKED:", plain or behind Markdown markers (`**BLOCKED:**`, `## BLOCKED:`), passes, so a
# stuck agent can still say why. Red goes out as a JSON decision on stdout, never as stderr with
# exit 2: a stderr that says "No such file or directory" reads as a broken hook and lets it stop.
# shellcheck disable=SC2016 # the quoted text is a program for bun; the shell expands none of it
input=$(cat)
cwd=$(INPUT=$input bun -e '
  const input = JSON.parse(process.env.INPUT)
  const report = input.tool_input?.message ?? input.last_assistant_message
  if (report == null || /^[#>*_`\s]*BLOCKED[*_`]*:/.test(report)) process.exit(3)
  console.log(input.cwd)
')
[ $? -ne 3 ] || exit 0
if dir=$(git -C "$cwd" rev-parse --show-toplevel) && cd "$dir" &&
  output=$(NO_COLOR=1 make check 2>&1); then
  exit 0
fi
last=$(printf '%s\n' "$output" | tail -n 60)
REASON="make check is red in '$dir'. Fix it before you hand back, or start your report with
BLOCKED: and explain why the step cannot be finished. Last 60 lines:
$last" INPUT=$input bun -e '
  const reason = process.env.REASON
  const event = JSON.parse(process.env.INPUT).hook_event_name
  const deny = { hookEventName: event, permissionDecision: "deny", permissionDecisionReason: reason }
  console.log(JSON.stringify(event === "PreToolUse"
    ? { hookSpecificOutput: deny }
    : { decision: "block", reason }))
'
