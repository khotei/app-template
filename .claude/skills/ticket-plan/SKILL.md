---
name: ticket-plan
description: "SDD 3/5: turn feature.md and architecture.md into a reviewed plan.md"
argument-hint: "<ticket folder>"
disable-model-invocation: true
metadata:
  delegates: "none"
  spawns: "none"
  hooks: "none"
  overrides: "replaces to-tickets, which writes to .scratch/ or an issue tracker"
  reads: "docs/tickets/<ticket>/feature.md, docs/tickets/<ticket>/architecture.md, docs/tickets/_template/plan.md"
  writes: "docs/tickets/<ticket>/plan.md"
---

Write the implementation plan for the ticket at `$ARGUMENTS`. **This is the heavy review**: later
steps only conform to the plan. Gates: `.claude/rules/sdd.md`.

## Steps

1. Read `feature.md` and `architecture.md`.
2. Cut the work into **vertical slices**, each one commit that leaves `make check` green and fits
   one fresh implementer session (≤ ~400 changed lines, lockfiles excluded).
3. Write `plan.md` from `docs/tickets/_template/plan.md`. Every step has:
   - **Goal** with the `R…` and `D…` ids it serves;
   - **Blocked by:** the steps it needs, or `none`. Steps without a path between them are
     independent;
   - **Files**;
   - **Test first**: the Seam from `architecture.md` and the behaviour to see red, or `config only`;
   - **Verify**: commands and manual checks;
   - **Status:** `todo`.
4. End with a coverage table that maps every `R…` to at least one step.
5. Present the plan and iterate until the user approves it. Next comes
   `/ticket-implement <ticket folder>`.

Commit only on the user's explicit OK.
