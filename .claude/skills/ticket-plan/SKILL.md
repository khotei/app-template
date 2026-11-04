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
     cannot fail is seen before the step runs.
     - A step that changes or removes a guard lists, in the template's **Probes** shape, one probe
       per ban of each scope it changes or removes, of every scope when it rewrites the guard
       whole. A scope is one Biome override, the root config, one Biome plugin or one grep; a ban
       is one restriction in it with its own message: a pattern or a path of an override or of
       the root's import rule, a root rule that refuses an import (`noImportCycles`), one
       diagnostic a plugin registers, a grep's pattern. An override of four groups takes four
       probes. Each probe is one import or line that its ban alone refuses, and names the command
       it fails (the guard's tool alone, or `make check`).
     - A step that edits a file a requirement measures re-measures it;
   - **Model**: `opus medium` for a move, rename or config step, `opus high` for a step that
     writes behaviour; `/ticket-implement` spawns the implementer on it;
   - **Status:** `todo`.
   A step that writes or rewrites a `docs/knowledge/` page also trims, in the same step, every
   rule and `CLAUDE.md` line that restates it.
4. **Check** the plan: spawn `researcher` once, with three lists.
   - **Exists**: every existing file path, API, flag or dependency a step names; paths the plan
     creates are left out. Each comes back `confirmed`, or `wrong` with evidence and the correct
     value.
   - **Conforms**: every literal a step pins (a name, signature, path or message), with the
     workspace it lands in. Each comes back `conforms`, or with the line (`path:line`) it breaks
     in `.claude/rules/*.md` or that workspace's `CLAUDE.md`.
   - **Red**: every Verify check for new work (one that names a state the step creates), run once
     on the main tree, read-only. Each comes back `fails as expected` with its output, `passes`,
     or `cannot run` with its error.
   For a step that changes or removes a guard, spawn a second `researcher` with its probes and the
   worktree `<slug>-plan-probes`: it plants each probe there, runs the probe's command and quotes
   the failing line. Create the worktree first with
   `git worktree add -b wt/<slug>-plan-probes .claude/worktrees/<slug>-plan-probes HEAD`, then run
   `make worktree N=<n> NAME=<slug>-plan-probes` inside it, `<n>` unused by a live worktree; the
   branch comes first because `make worktree` renames the current branch, so on a detached
   worktree it fails. After the report, remove the worktree and its branch in a command of their
   own (`git worktree remove --force`, `git branch -D`) and check that `git worktree list` no
   longer shows it.
   Fix in `plan.md`, before presenting it, every `wrong`, every broken rule, every `passes` and
   `cannot run`, and every probe that does not fail. The reports stay in the conversation;
   `plan.md` records no check but the probes, each with its failing line.
5. End with a coverage table that maps every `R…` to at least one step.
6. Present the plan and iterate until the user approves it. Next comes
   `/ticket-implement <ticket folder>`.

Commit under the commit gate of `.claude/rules/sdd.md`.
