---
paths:
  - "**/CLAUDE.md"
  - ".claude/**"
  - "docs/knowledge/**"
---

# Maintaining `CLAUDE.md`, rules, docs and the toolkit

A `CLAUDE.md` or rule caches what the **code cannot say**: the *why*, and the constraints that are
not local to one file. Every line is paid for in every matching session, so a line earns its place
only by changing behaviour.

## The test, before writing any line

1. **Would Claude get this right anyway** — from the code, the stack or the surrounding style?
   Yes → don't write it (restating a signature goes stale on the next refactor).
2. **Would a reader get this wrong, or waste real time, without it?** Yes → write it.

What passes: binding decisions plus the rejected alternative (the ones a reader would "fix"
back) · invariants types cannot express · cross-workspace coupling · non-obvious gotchas
(ordering, version quirks) · boundaries (import direction, ownership) · one pointer to the file
where a surface lives. What fails: behaviour narration (per-function descriptions, signatures,
test walkthroughs). When in doubt, cut. A dispute over whether a line changes what an agent does
is settled by a replay run, never argued
([how](../../docs/knowledge/sdd.md#evaluating-the-toolkit)).

## The owner

Each fact has one author; every other file links it by name and never restates it.

| Fact | Home |
|---|---|
| Binding constraints of one layer or workspace | `<layer>/CLAUDE.md` |
| Repo-wide conventions | `.claude/rules/*.md` |
| How the system works, for humans | `docs/knowledge/*.md` |
| Why a boundary holds, what guards it, what its reversal breaks | `docs/knowledge/decisions.md` |
| One change's intent, steps and decisions | its `lab.md` in `docs/tickets/`, or a micro's first commit |
| What changed and why | `git log` |

A `CLAUDE.md` or rule states only the *currently binding* constraint and links its decision: its
history lives in commit `Decision:` paragraphs and the lab's Knowledge, so no dates, superseded
chains, ticket numbers or tombstones. A lesson learned from building changes a skill, a rule or a
check, never a `CLAUDE.md`, only on the user's OK, and a line it adds names the line it replaces.

## The pattern

Write the pattern, not the instance, so a refactor leaves the line true: placeholders
(`<Name>Repository`, `<verb>-<object>`) and a short neutral snippet in a fence (an `Order`, not a
model of this app). A live name only for a stable anchor: a workspace, a `make` target, a library
API, the template's own infrastructure (the transaction, the queue sender, the test harnesses).
Before stating a fact, grep for it: when another file owns it, link there. Never list what `ls`
or `grep` reproduces. If a rename forces a doc edit, the doc held *what*, not *why*: delete the
line, don't update it.

A line a reader could apply two ways carries one example in that neutral domain: inline
`wrong → right`, or a fenced `diff` whose `-` line ends in `// why` and whose `+` line passes;
its API is checked like code. None where a check prints the fix.

## The limits and the checks

- **Limits, checked by `make doc-lint`:** a `CLAUDE.md` 40 lines, a rule 80.
  Over a limit, cut; never append
  ([why](../../docs/knowledge/decisions.md#instructions-within-size-limits)).

## The toolkit

- Procedures are skills: a colon is reserved for plugin namespaces, and there is no
  `.claude/commands/`. Why the toolkit is cut so: `docs/knowledge/sdd.md`.
- Tool limits live on the agent (`disallowedTools`); an agent that cannot edit has its skill
  persist its output.
- A change to the skill (a pair a close adds to `stops.md` aside), an agent or this rule runs
  the replays of
  [sdd.md › Evaluating the toolkit](../../docs/knowledge/sdd.md#evaluating-the-toolkit) before
  and after it, and lands only when no replay gets worse.
