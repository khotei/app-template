---
paths:
  - "**/CLAUDE.md"
  - ".claude/**"
  - "docs/knowledge/**"
---

# Maintaining `CLAUDE.md`, rules and docs

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
- **Decision history lives in commit `Decision:` paragraphs and the ticket's
  `architecture.md › Decisions`**, never in `CLAUDE.md` or rules. These state only the
  *currently binding* constraint: no dates, no superseded chains, no ticket numbers, no tombstones.
- **No behaviour narration**: no per-function descriptions, signatures or test walkthroughs.
- **One author per fact**: if another doc states it, link it by name; never restate it.

## Where each kind of fact lives

| Fact | Home |
|---|---|
| Binding constraints of one layer or workspace | `<layer>/CLAUDE.md` |
| Repo-wide conventions | `.claude/rules/*.md` |
| How the system works, for humans | `docs/knowledge/*.md` |
| One ticket's what, why and how | `docs/tickets/<YYYY-MM-DD>_<slug>/` |
| What changed and why | `git log` |

## Belongs

Binding decisions plus the rejected alternative (the ones a reader would "fix" back) · invariants
types cannot express · cross-workspace coupling · non-obvious gotchas (ordering, version quirks) ·
boundaries (import direction, ownership) · pointers to the file where a surface lives.

Refresh a doc only when a real change lands, inside that change's commit. When in doubt, cut.
