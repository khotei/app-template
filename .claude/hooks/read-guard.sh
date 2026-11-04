#!/bin/sh
# PreToolUse guard on the reviewer's Bash. A finding's line is the number Read shows, so it refuses
# cat, head, tail and sed -n on a file git tracks; the same commands after a single pipe or on an
# untracked file, git diff and git show pass. Quoted text is blanked and a command starts as in
# bash-guard.sh. It guards a habit, not an evasion such as `sh -c` or a variable.

reason=$(bun -e '
const input = await Bun.stdin.json()
const text = String(input.tool_input?.command ?? "").replace(/\x27[^\x27]*\x27|"(?:\\.|[^"\\])*"/g, "\x27\x27")
const tracked = (file) => Bun.spawnSync(["git", "-C", String(input.cwd ?? process.cwd()), "ls-files", "--", file]).stdout.length > 0
// A command and its words up to the next separator or redirect.
for (const [, name, args] of text.matchAll(/(?:^|\|\||[;&({`]|\b(?:do|then|else)\b)\s*(cat|head|tail|sed)\b([^;&|(){}`<>\n]*)/gm)) {
  const words = args.split(/\s+/).filter(Boolean)
  if (name === "sed" && !words.some((word) => /^-[A-Za-z]*n|^--(?:quiet|silent)$/.test(word))) continue
  if (words.some((word) => !word.startsWith("-") && tracked(word))) {
    console.log("Read a tracked file with Read, offset and limit for a part, so a finding cites the line Read shows; locate lines with grep -n or git grep, and read a past version with git show.")
    break
  }
}
') || reason="read-guard.sh failed, so the command is refused: read the file with Read, or say in your report why you could not."
[ -z "$reason" ] && exit 0
printf '%s\n' "$reason" >&2
exit 2
