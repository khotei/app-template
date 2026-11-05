---
name: ticket-plan
description: "SDD 3/5: turn feature.md and architecture.md into a reviewed plan.md. Run only when the user asks for this phase"
argument-hint: "<ticket folder>"
---

Write the implementation plan for the ticket at `$ARGUMENTS`. **This is the heavy review**: later
steps only conform to the plan. Gates: `.claude/rules/sdd.md`.

## Steps

1. Read `feature.md` and `architecture.md`.
2. Cut the work into **deliverables**, each a step, as `sdd.md › Gates` defines it: one outcome
   to observe, whole when it lands, its acceptance check red before and green after, `make check`
   green. Cut by what the system does, never by endpoint group or layer. Everything a step adds (a
   name, a type, a page) is used by that step's own code or test; no step leaves scaffolding a
   later step rewrites or removes, and a page or rule is written in the one step where its
   behaviour is complete. Lockfiles and snapshots are excluded from its size.
3. Write `plan.md` from `docs/tickets/_template/plan.md`, opening with its **Status** table, one
   row per step. Every step has:
   - **Delivers**: what exists or behaves differently once it lands, in plain words, no ids;
   - **Goal**: the outcome and the constraints it keeps, with the `R…` and `D…` ids it serves;
   - **Blocked by:** the steps it needs, or `none`. Steps without a path between them are
     independent;
   - **Files**: where the step starts, and what it must pin: a decided contract (name, path,
     signature), a trap the code cannot show, a probe's target. The implementer finds every other
     file by a search at the step (its *Leftovers*) and names it in its report, so the list is a
     start, not the bound;
   - **Introduces**: each new name with its first consumer, which is in this step, and
     `Removes later: none`; a consumer in a later step moves the name there;
   - **Size**: the changed lines expected, as `git diff -M --stat` counts them, summed over every
     file the change reaches, code and tests together, docs apart (`~260, docs ~150`); a step over
     ~400 of code and tests is split before the plan is presented; counting only the moved code
     undercounts it;
   - **Test first**: the Seam from `architecture.md` and the acceptance check to see red, or
     `config only` with a Verify command that fails before the step;
   - **Verify**: commands and manual checks, each naming the state it fails on, so a check that
     cannot fail is seen before the step runs.
     - A step that adds, changes or removes a guard or a scope of one lists its probes as
       [guard-probes.md](guard-probes.md) beside this file says.
     - A step that edits a file a requirement measures re-measures it.
     - A check that says "renaming X edits N files" plants the rename at X's deepest nesting (a
       field inside a model that another model embeds), not at the top level.
     - A check never reads "passes until S<n>" or names a state a later step changes; reorder
       the steps. An added scope's own probes are the one exception.
     - A check repeated over many inputs (a probe list, a count per file) runs from one script
       the step names, not one tool call per input, so step 4's run and the step's Verify rerun
       the same set.
   - **Model**: `opus medium` for a move, rename or config step, `opus high` for a step that
     writes behaviour; `/ticket-implement` spawns the implementer on it;
   - **Status:** `todo`.
   A step that writes or rewrites a `docs/knowledge/` page also trims, in the same step, every
   rule and `CLAUDE.md` line that restates it.
4. **Check** the plan: spawn `researcher` once, with four lists.
   - **Exists**: every existing file path, API, flag or dependency a step names; paths the plan
     creates are left out. Each comes back `confirmed`, or `wrong` with evidence and the correct
     value.
   - **Conforms**: every literal a step pins (a name, signature, path or message), with the
     workspace it lands in. Each comes back `conforms`, or with the line (`path:line`) it breaks
     in `.claude/rules/*.md` or that workspace's `CLAUDE.md`.
   - **Red**: every Verify check for new work (one that names a state the step creates), run once
     on the main tree, read-only. Each comes back `fails as expected` with its output, `passes`,
     or `cannot run` with its error. Each is also run once with the break it is meant to catch
     planted (a broken link, the line removed) in a `git clone --local` of the repo in the system
     temp directory, since a copy without its own git repository fails a git-aware check before
     it runs. It comes back `catches` only when its output names the planted break, else
     `misses`.
   - **Shape**: from the plan's text and `git grep`, one line per step, `ok` or `fail: <reason>`:
     a name whose first consumer is in a later step; a file or page that two steps edit (the
     Status and coverage tables apart); wording that makes a step depend on a later one ("until
     S", "interim", "temporary"), an added scope's own probes apart; a guard whose break an
     earlier step's Verify already fails on.
   For a step that adds, changes or removes a guard or a scope of one, spawn a second `researcher`
   with its probes and the worktree `<slug>-plan-probes`; it runs them as
   `.claude/agents/researcher.md` says. Create the worktree first with
   `git worktree add -b wt/<slug>-plan-probes .claude/worktrees/<slug>-plan-probes HEAD`, then run
   `make worktree N=<n> NAME=<slug>-plan-probes` inside it, `<n>` unused by a live worktree; the
   branch comes first because `make worktree` renames the current branch, so on a detached
   worktree it fails. After the report, remove the worktree and its branch in a command of their
   own (`git worktree remove --force`, `git branch -D`) and check that `git worktree list` no
   longer shows it.
   Fix in `plan.md`, before presenting it, every `wrong`, every broken rule, every `passes`,
   `cannot run`, `misses` and `fail` (a `fail` by moving work between steps, never by wording),
   and every probe that does not fail, but an added scope's own. The reports stay in the
   conversation; `plan.md` records no check but the probes, each with its plan-time output.
5. End with a coverage table that maps every `R…` to at least one step.
6. Present the plan and iterate until the user approves it. Next comes
   `/ticket-implement <ticket folder>`.

Commit under the commit gate of `.claude/rules/sdd.md`.
