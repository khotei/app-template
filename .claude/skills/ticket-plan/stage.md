# The stage procedure

Read this file afresh at every preparation, even when this session read it before: compaction
restores only the files last modified, never one only read.

It prepares one stage of a plan in stages: `/ticket-plan` runs it for the first stage and for
`next`, the loop of `/ticket-implement` at a stage's close. It ends by returning to its caller,
whose skill says how the run ends.

## In

The ticket folder and the stage `<n>` to prepare. Read `feature.md`, `architecture.md`, the
plan's **Status** (the skeleton) and, of each closed stage, its `### Stage design`, its
`### Stage review` and its `verification.md › Stage <k>` section where one was run, with the code
as it stands. That is the base: look only at the stage ahead, and never re-review a closed stage.

## Does

1. **Check the facts** before a line of the design. Spawn `researcher` on `opus high` with every
   assumption of `architecture.md › Assumptions` that names this stage and every fact the stage's
   skeleton rows rest on: a file, API or flag, the shape of the earlier stages' code. A fact only
   a run shows goes to a second `researcher` on `opus high`, with the probe and the worktree
   below. Record the results at the head of the stage's `### Stage design`, each with its source
   or probe output. For a stage after the first, commit `plan.md` at once as `St<n> (PLAN) Record
   the facts of stage <n>`, so a compaction or a question round loses none; a first plan's
   facts wait for its approval.
2. **Write the stage design:** the names, signatures and files the stage fixes, then each choice
   it makes from `architecture.md › Direction` or that a fact forces, as
   `- **<choice>** — set aside: <option> — fact: <the fact> — used by: S<n>`. A direction is
   taken or set aside with its fact, never put to the user.
3. **Write the stage's steps in full** under `### Steps`, from its skeleton rows, each a
   deliverable cut by the rule of **Cut the skeleton** in [SKILL.md](SKILL.md) beside this file.
   Every step has:
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
     ~400 of code and tests is split before the stage is presented; counting only the moved code
     undercounts it;
   - **Test first**: the Seam from `architecture.md` and the acceptance check to see red, or
     `config only` with a Verify command that fails before the step;
   - **Verify**: commands and manual checks, each naming the state it fails on, so a check that
     cannot fail is seen before the step runs.
     - A step that adds, changes or removes a guard or a scope of one lists its probes as
       [guard-probes.md](guard-probes.md) beside this file says.
     - A step that edits a file a requirement measures re-measures it.
     - A step that changes a guard, a mapper or a check greps its name over `architecture.md`, the
       records and the `CLAUDE.md` files, and lists each line it rewrites.
     - A check that says "renaming X edits N files" plants the rename at X's deepest nesting (a
       field inside a model that another model embeds), not at the top level.
     - A check never reads "passes until S<n>" or names a state a later step changes; reorder
       the steps. An added scope's own probes are the one exception.
     - A check repeated over many inputs (a probe list, a count per file) runs from one script
       the step names, not one tool call per input, so the plan check and the step's Verify rerun
       the same set.
   - **Model**: `opus medium` for a move, rename or config step, `opus high` for a step that
     writes behaviour; `/ticket-implement` spawns the implementer on it;
   - **Status:** `todo`.
   A step that writes or rewrites a `docs/knowledge/` page also trims, in the same step, every
   rule and `CLAUDE.md` line that restates it. Set each requirement's `Completed in` in the
   coverage table to the stage of its last step.
4. **Check** the stage: spawn `researcher` on `opus high` once, with five lists over its steps.
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
     a step that does not stand alone, as the Spec pass of `.claude/agents/reviewer.md` defines
     it; a file or page that two steps of the plan edit (the Status and coverage tables apart);
     wording that makes a step depend on a later one ("until S", "interim", "temporary"), an
     added scope's own probes apart; a guard whose break an earlier step's Verify already fails
     on.
   - **Coverage**: every `R…` of `feature.md` against the skeleton rows and the stage's steps;
     a requirement that no step serves comes back `fail`, named.
   For a step that adds, changes or removes a guard or a scope of one, spawn a second `researcher`
   on `sonnet medium` with its probes and the worktree; it runs them as
   `.claude/agents/researcher.md` says.
   Fix in `plan.md` every `wrong`, every broken rule, every `passes`, `cannot run`, `misses` and
   `fail` (a `fail` by moving work between steps, never by wording), and every probe that does
   not fail, but an added scope's own. The reports stay in the conversation; `plan.md` records no
   check but the facts and the probes, each with its plan-time output.
5. **Triage** what the stage changed. Put to the user one question round, each question with its
   options and a recommendation, for:
   - a change to the architecture: a false assumption, a Seam, a Contract, a `D…`;
   - a change to the step list: a step added, removed or reordered, or a step's outcome changed;
     a skeleton row is never dropped without a finding that names why;
   - a choice a reviewer could question that changes visible behaviour or costs much to undo;
   - a stage choice that changes a Contract and whose `used by` names a step outside the stage,
     raised to a `D…`; a name a later step merely reuses stays in the stage design.
   Every other choice stays recorded in the stage design.
6. **Commit** a stage after the first that has no question as `St<n> (PLAN) Prepare stage <n>`,
   its body naming what changed in the skeleton, the coverage or `architecture.md`, and why, the
   Stage review's findings among the causes. A question round commits nothing more; once the user
   has answered, apply the answers (to `architecture.md` where they agreed), check what changed as
   step 4 does, and commit the same way. A first plan's stage commits with its approval. Every
   commit follows the commit gate of `.claude/rules/sdd.md` and is named as
   `.claude/rules/commits.md` says.

You may choose `fable` over any default of this file where you judge the answer will be better
for it, chiefly where it settles a design that nothing after it re-checks, and name it in the
status.

## The worktree

A probe runs in the disposable worktree `<slug>-plan-probes`. Create it first with
`git worktree add -b wt/<slug>-plan-probes .claude/worktrees/<slug>-plan-probes HEAD`, then run
`make worktree N=<n> NAME=<slug>-plan-probes` inside it, `<n>` unused by a live worktree; the
branch comes first because `make worktree` renames the current branch, so on a detached worktree
it fails. After the report, remove the worktree and its branch in a command of their own
(`git worktree remove --force`, `git branch -D`) and check that `git worktree list` no longer
shows it.

## Out

The edited `plan.md` (and `architecture.md` where the user agreed), and either nothing for the
user or the question round. Return to the caller.
