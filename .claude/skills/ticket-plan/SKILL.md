---
name: ticket-plan
description: "SDD 3/5: turn feature.md and architecture.md into a reviewed plan.md"
argument-hint: "<ticket folder>"
disable-model-invocation: true
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
   - **Model**: `opus medium` for a move, rename or config step, `fable high` for a step that
     writes behaviour; `/ticket-implement` spawns the implementer on it;
   - **Status:** `todo`.
   A step that writes or rewrites a `docs/knowledge/` page also trims, in the same step, every
   rule and `CLAUDE.md` line that restates it.
4. **Check** the plan: spawn `researcher` once, with two lists.
   - **Exists**: every existing file path, API, flag or dependency a step names; paths the plan
     creates are left out. Each comes back `confirmed`, or `wrong` with evidence and the correct
     value.
   - **Conforms**: every literal a step fixes (a name, signature, path or message), with the
     workspace it lands in. Each comes back `conforms`, or with the line (`path:line`) it breaks
     in `.claude/rules/*.md` or that workspace's `CLAUDE.md`.
   Fix every `wrong` and every broken rule in `plan.md` before presenting it. The report stays in
   the conversation; `plan.md` records no check.
5. End with a coverage table that maps every `R…` to at least one step.
6. Present the plan and iterate until the user approves it. Next comes
   `/ticket-implement <ticket folder>`.

Commit only on the user's explicit OK.
