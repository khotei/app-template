#!/bin/sh
# PreToolUse guard on the implementer's Bash. It refuses a read of a tracked file through a command
# of `reads`, since only the file tools fire the rules' path filters, and a git command of `drops`,
# which drops uncommitted work; writes through `>`, `sed -i` or `tee` are not its concern. It
# splits the command into words as the shell does, so a quoted mention, a comment or a
# here-document body passes; it guards a habit, not an evasion such as `sh -c`. When the guard
# itself fails, it refuses the command.

# Each entry is `<command>[:<flag>,…]`: the command refused alone, or only with one of the flags.
reads='cat head sed:-n,--quiet,--silent'
drops='checkout stash restore clean reset:--hard switch:--discard-changes,-f,--force'

input=$(cat)
named=
for entry in $reads $drops; do
  case $input in *"${entry%%:*}"*) named=1 ;; esac
done
[ -n "$named" ] || exit 0

output=$(printf '%s' "$input" | GUARD_READS="$reads" GUARD_DROPS="$drops" bun -e '
import { existsSync, realpathSync } from "node:fs"
import { basename, dirname, resolve } from "node:path"

try {
  guard(await Bun.stdin.json())
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}

// Words per simple command. After a redirect, skip holds its operator: the next word is its
// target, which the command does not read, or, after <<, a here-document delimiter.
function words(text) {
  const segments = [[]]
  const heredocs = []
  let word = null
  let skip = ""
  function endWord() {
    if (word === null) return
    if (skip === "<<") heredocs.push(word)
    if (skip === "") segments.at(-1).push(word)
    skip = ""
    word = null
  }
  function endSegment() {
    endWord()
    skip = ""
    if (segments.at(-1).length > 0) segments.push([])
  }
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === "\\") {
      if (text[i + 1] !== "\n") word = (word ?? "") + (text[i + 1] ?? "")
      i++
    } else if (c === "\x27") {
      const stop = text.indexOf("\x27", i + 1)
      const end = stop < 0 ? text.length : stop
      word = (word ?? "") + text.slice(i + 1, end)
      i = end
    } else if (c === "\"") {
      let part = ""
      for (i++; i < text.length && text[i] !== "\""; i++) {
        if (text[i] === "\\") i++
        part += text[i] ?? ""
      }
      word = (word ?? "") + part
    } else if (c === "#" && word === null) {
      const stop = text.indexOf("\n", i)
      i = (stop < 0 ? text.length : stop) - 1
    } else if (c === " " || c === "\t") {
      endWord()
    } else if (c === "\n") {
      endSegment()
      for (const delimiter of heredocs.splice(0)) {
        while (i < text.length) {
          const stop = text.indexOf("\n", i + 1)
          const end = stop < 0 ? text.length : stop
          const line = text.slice(i + 1, end)
          i = end
          if (line.trim() === delimiter) break
        }
      }
    } else if (";&|()`".includes(c)) {
      endSegment()
    } else if (c === "<" || c === ">") {
      endWord()
      let op = c
      while ("<>&".includes(text[i + 1] || "x")) op += text[++i]
      if (op === "<<" && text[i + 1] === "-") i++
      if (op !== "<") skip = op
    } else {
      word = (word ?? "") + c
    }
  }
  endWord()
  return segments
}

function rules(variable) {
  return String(process.env[variable]).split(" ").filter(Boolean).map((entry) => {
    const [command, flags = ""] = entry.split(":")
    return { command, flags: flags.split(",").filter(Boolean) }
  })
}
// The rule as it applies to these arguments, such as "reset --hard", or "" when it does not.
function hit(rule, args) {
  if (rule.flags.length === 0) return rule.command
  const flag = rule.flags.find((f) =>
    f.startsWith("--") ? args.includes(f) : args.some((a) => /^-[A-Za-z]+$/.test(a) && a.includes(f[1])),
  )
  return flag ? `${rule.command} ${flag}` : ""
}
function real(path) {
  return existsSync(path) ? resolve(realpathSync(dirname(path)), basename(path)) : path
}
function git(dir, ...args) {
  const run = Bun.spawnSync(["git", "-C", dir, ...args], { stderr: "ignore" })
  return run.exitCode === 0 ? run.stdout.toString().trim() : ""
}
function refuse(reason) {
  console.error(reason)
  process.exit(2)
}

function guard(input) {
  const reads = rules("GUARD_READS")
  const drops = rules("GUARD_DROPS")
  let cwd = realpathSync(String(input.cwd || process.cwd()))
  for (const segment of words(String(input.tool_input.command))) {
    while (/^[A-Za-z_][A-Za-z0-9_]*=/.test(segment[0] ?? "")) segment.shift()
    const [program = "", ...args] = segment
    const name = program.split("/").at(-1)
    if (name === "cd") {
      const target = resolve(cwd, (args[0] ?? "~").replace(/^~/, process.env.HOME ?? "/"))
      cwd = existsSync(target) ? realpathSync(target) : target
    }
    if (name === "git") {
      let k = 0
      while (args[k]?.startsWith("-")) k += ["-C", "-c", "--git-dir", "--work-tree"].includes(args[k]) ? 2 : 1
      const drop = drops.map((r) => (r.command === args[k] ? hit(r, args.slice(k + 1)) : "")).find(Boolean)
      if (drop)
        refuse(`git ${drop} can drop uncommitted work: undo a probe by deleting or editing what it planted, and report a check that needs another tree as not run, with its command.`)
    }
    if (reads.some((r) => r.command === name && hit(r, args))) {
      const existing = args.filter((a) => !a.startsWith("-")).map((a) => resolve(cwd, a)).filter(existsSync).map(real)
      const root = existing.length > 0 ? git(cwd, "rev-parse", "--show-toplevel") : ""
      const inside = root ? existing.filter((p) => p.startsWith(`${root}/`)) : []
      const files = inside.length > 0 ? git(root, "--literal-pathspecs", "ls-files", "--", ...inside) : ""
      if (files)
        refuse(`Tracked: ${files.split("\n").join(", ")}. Read it with the Read tool, which loads the rules whose paths: filter matches it; ${name} through Bash loads none.`)
    }
  }
}
' 2>&1)
status=$?
[ "$status" = 0 ] && exit 0
if [ "$status" = 2 ]; then
  printf '%s\n' "$output" >&2
else
  printf 'bash-guard.sh failed (exit %s), so the command is refused: %s\n' "$status" \
    "$(printf '%s' "$output" | head -n 1)" >&2
fi
exit 2
