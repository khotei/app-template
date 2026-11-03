#!/bin/sh
# PreToolUse guard on the implementer's Bash. Only the file tools fire the rules' `paths:` filters,
# so it refuses a file read or edit through the shell, and `git checkout` or `restore`, which undo
# a file. Quoted text is blanked first, so a pattern inside a grep or a `bun -e` passes. It guards
# a habit, not an evasion such as `sh -c` or `python3 -c`.

reason=$(bun -e '
const command = String((await Bun.stdin.json()).tool_input?.command ?? "")
const text = command.replace(/\x27[^\x27]*\x27|"(?:\\.|[^"\\])*"/g, "\x27\x27")
const rules = " Only the file tools load the rules whose paths: filter matches the file."
// A heredoc, sed -i, or a redirect into anything but a descriptor or /dev/null.
if (/<<|\bsed\b[^;&|\n]*\s-(?:-in-place|[A-Za-z]*i)|(?<![<>=-])>>?\|?(?!\s*(?:&|\/dev\/null(?:[\s;&|)]|$)))/.test(text))
  console.log(`Edit a file with Edit and create one with Write.${rules}`)
// A command starts a line or follows ; & ( or $( — not a pipe, so `make … | tail` passes.
else if (/(?:^|[;&(])\s*(?:cat|head|tail|sed)\b/m.test(text))
  console.log(`Read a file with Read, offset and limit for a part; locate lines with grep -n or git grep.${rules}`)
else if (/(?:^|[;&(])\s*git(?:\s+-[Cc]\s+\S+)*\s+(?:checkout|restore)\b/m.test(text))
  console.log("Undo a probe with Edit, or delete the file it planted; a check that needs a clean tree is reported as not run, with its command.")
') || reason="bash-guard.sh failed, so the command is refused: use the file tools, or start your final message with BLOCKED: and explain why."
[ -z "$reason" ] && exit 0
printf '%s\n' "$reason" >&2
exit 2
