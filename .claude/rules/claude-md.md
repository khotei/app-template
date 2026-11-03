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

If a rename or refactor forces a doc edit, the doc held *what*, not *why*: delete the line, don't
update it.

## Hard limits

- **`CLAUDE.md` ≤ ~40 lines; a rule file ≤ ~80.** Over budget ⇒ cut, don't append.
- **A binding architecture decision has its record in `docs/knowledge/decisions.md`; its history
  lives in commit `Decision:` paragraphs and the ticket's `architecture.md › Decisions`**, never
  in `CLAUDE.md` or rules. These state only the *currently binding* constraint and link the
  record: no dates, no superseded chains, no ticket numbers, no tombstones.
- **No behaviour narration**: no per-function descriptions, signatures or test walkthroughs.
- **One author per fact**: if another doc states it, link it by name; never restate it.
- **Write the pattern, not the instance,** so a refactor leaves the rule true: placeholders
  (`<Name>Repository`, `<verb>-<object>`) and a short neutral snippet in a fence (an `Order`, not
  a model of this app). A live name only for a stable anchor: a workspace, a `make` target, a
  library API, the template's own infrastructure (the transaction, the queue client, the test
  harnesses). Never list what `ls` or `grep` reproduces; `make doc-names` fails on a backticked
  path or name the repo lacks, and on a source path in an instruction file
  ([why](../../docs/knowledge/decisions.md#instructions-name-patterns)); `make rule-paths` fails
  on a rule whose `paths:` filter matches no file.

## Where each kind of fact lives

| Fact | Home |
|---|---|
| Binding constraints of one layer or workspace | `<layer>/CLAUDE.md` |
| Repo-wide conventions | `.claude/rules/*.md` |
| How the system works, for humans | `docs/knowledge/*.md` |
| Why a boundary holds, what guards it, what its reversal breaks | `docs/knowledge/decisions.md` |
| One ticket's what, why and how | its folder in `docs/tickets/` (`sdd.md`) |
| What changed and why | `git log` |

## Belongs

Binding decisions plus the rejected alternative (the ones a reader would "fix" back) · invariants
types cannot express · cross-workspace coupling · non-obvious gotchas (ordering, version quirks) ·
boundaries (import direction, ownership) · one pointer to the file where a surface lives.

Refresh a doc only when a real change lands, inside that change's commit. When in doubt, cut.
A lesson learned from building changes a skill, a rule or a check, never a `CLAUDE.md`, and only
on the user's OK.

## The toolkit

How the skills, agents and plugin fit, and what each uses: `docs/knowledge/sdd.md`, whose
dependency map a commit updates when it changes what a skill or agent uses. Two constraints it
does not hold:

- Procedures are skills in `.claude/skills/ticket-<phase>/SKILL.md`: a colon is reserved for
  plugin namespaces, and there is no `.claude/commands/`.
- Tool limits live on the agent (`disallowedTools`); an agent that cannot edit or spawn
  agents has its skill persist its output.
