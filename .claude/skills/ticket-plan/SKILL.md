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
2. Cut the work into **vertical slices**, each a step, as `sdd.md › Gates` defines it, that
   leaves `make check` green (lockfiles excluded from its size).
3. Write `plan.md` from `docs/tickets/_template/plan.md`, opening with its **Status** table, one
   row per step. Every step has:
   - **Delivers**: what exists or behaves differently once it lands, in plain words, no ids;
   - **Goal**: the outcome and the constraints it keeps, with the `R…` and `D…` ids it serves;
   - **Blocked by:** the steps it needs, or `none`. Steps without a path between them are
     independent;
   - **Files**: where the step starts, and what it must pin: a decided contract (name, path,
     signature), a trap the code cannot show, a probe's target. The implementer finds every other
     file by `git grep` at the step (its *Leftovers*) and names it in its report, so the list is a
     start, not the bound;
   - **Size**: the changed lines expected, as `git diff -M --stat` counts them, summed over every
     file the change reaches, tests and docs included; a step over ~400 is split before the plan
     is presented; counting only the moved code undercounts it;
   - **Test first**: the Seam from `architecture.md` and the behaviour to see red, or `config only`;
   - **Verify**: commands and manual checks, each naming the state it fails on, so a check that
     cannot fail is seen before the step runs; a step that replaces a guard has one probe per
     guard, run red before the guard is replaced; a step that edits a file a requirement measures
     re-measures it;
   - **Model**: `opus medium` for a move, rename or config step, `opus high` for a step that
     writes behaviour; `/ticket-implement` spawns the implementer on it;
   - **Status:** `todo`.
   A step that writes or rewrites a `docs/knowledge/` page also trims, in the same step, every
   rule and `CLAUDE.md` line that restates it.
4. **Check** the plan: spawn `researcher` once, with two lists.
   - **Exists**: every existing file path, API, flag or dependency a step names; paths the plan
     creates are left out. Each comes back `confirmed`, or `wrong` with evidence and the correct
     value.
   - **Conforms**: every literal a step pins (a name, signature, path or message), with the
     workspace it lands in. Each comes back `conforms`, or with the line (`path:line`) it breaks
     in `.claude/rules/*.md` or that workspace's `CLAUDE.md`.
   Fix every `wrong` and every broken rule in `plan.md` before presenting it. The report stays in
   the conversation; `plan.md` records no check.
5. End with a coverage table that maps every `R…` to at least one step.
6. Present the plan and iterate until the user approves it. Next comes
   `/ticket-implement <ticket folder>`.

Commit under the commit gate of `.claude/rules/sdd.md`.
