#!/bin/sh
# PreToolUse guard on the reviewer's Bash. A finding's line is the number Read shows, so it refuses
# cat, head, tail and sed -n on a file git tracks; the same commands after a single pipe or on an
# untracked file, git diff and git show pass. A command starts as in bash-guard.sh; a path resolves
# against the cwd and every cd before it, and git is asked from the file's own folder, so a quoted
# path, a worktree or a cwd outside the repo count too. A cd adds a folder and never replaces one,
# since it may fail or sit in a subshell, so a path tracked from the cwd is refused after a cd
# elsewhere, an over-refusal that costs one Read. It guards a habit, not an evasion such as
# `sh -c` or a variable.

reason=$(bun -e '
import { basename, dirname, resolve } from "node:path"
import { homedir } from "node:os"
const input = await Bun.stdin.json()
const command = String(input.tool_input?.command ?? "")
// Quoted text is blanked to its own length: a command starts outside quotes, a word keeps its place.
const text = command.replace(/\x27[^\x27]*\x27|"(?:\\.|[^"\\])*"/g, (quoted) => "\x27".repeat(quoted.length))
// Every folder the command may be in: a cd can fail or sit in a subshell, so none replaces another.
let dirs = [String(input.cwd ?? process.cwd())]
const paths = (word) => dirs.map((dir) => resolve(dir, word.replace(/["\x27]/g, "").replace(/^~(?=\/|$)/, homedir())))
const tracked = (file) => Bun.spawnSync(["git", "-C", dirname(file), "ls-files", "--", basename(file)]).stdout.length > 0
// A command and its words up to the next separator or redirect.
for (const match of text.matchAll(/(?:^|\|\||[;&({`]|\b(?:do|then|else)\b)\s*(cd|cat|head|tail|sed)\b([^;&|(){}`<>\n]*)/dgm)) {
  const [name, args] = [match[1], match.indices[2][0]]
  const words = [...match[2].matchAll(/\S+/g)].map((word) => command.slice(args + word.index, args + word.index + word[0].length))
  if (name === "cd") dirs = words.includes("-") ? dirs : [...new Set([...dirs, ...paths(words.find((word) => !word.startsWith("-")) ?? "~")])]
  else if (name === "sed" && !words.some((word) => /^-[A-Za-z]*n|^--(?:quiet|silent)$/.test(word))) continue
  else if (words.some((word) => !word.startsWith("-") && paths(word).some(tracked))) {
    console.log("Read a tracked file with Read, offset and limit for a part, so a finding cites the line Read shows; locate lines with grep -n or git grep, and read a past version with git show.")
    break
  }
}
') || reason="read-guard.sh failed, so the command is refused: read the file with Read, or say in your report why you could not."
[ -z "$reason" ] && exit 0
printf '%s\n' "$reason" >&2
exit 2
