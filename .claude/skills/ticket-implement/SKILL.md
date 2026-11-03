---
name: ticket-implement
description: "SDD 4/5: implement one plan.md step, review it, and commit it under the commit gate"
argument-hint: "<ticket folder> [step id, default: next todo]"
disable-model-invocation: true
---

Take one step of the ticket at `$ARGUMENTS` from `todo` to a commit. Gates:
`.claude/rules/sdd.md`. Steps run in parallel change how steps 2 and 5 run: before them, read
[parallel-steps.md](parallel-steps.md) beside this file.

## Steps

1. **Pick the step:** the one named, else the first `todo` step whose `Blocked by` steps are all
   `done`. Check that the branch is the ticket branch (`<type>/<slug>`) and that `git status`
   shows no uncommitted change to tracked files; otherwise stop and ask.
2. **Implement.** Spawn the `implementer` agent with pointers only: the ticket folder and the
   step id, on the `model` and `effort` the step's **Model** line names (`opus medium` for a
   move, rename or config step; `opus high` for one that writes behaviour). What it reads, what
   it leaves to you and how it reports are in its file; a brief does not repeat them. Its
   `make check` hook keeps it working until the gate is green. A report that starts with
   `BLOCKED:` goes straight to the user. At the session's first step, ask the commit question of
   `.claude/rules/sdd.md › Gates` now, while the implementer works, and hold the answer; a later
   step does not ask again.
   - **Simplify, a behaviour step only** (`opus high`), run by you, never by the implementer: the
     refactor that `tdd` leaves out of its red → green loop. Call the Skill tool with `simplify`
     on the uncommitted step, its args pointing at the step in `plan.md`, the rules
     `make review-rules` prints (which override it), and the deletion test and depth of
     `mattpocock-skills:codebase-design`; it keeps every interim state the plan names (a
     delegating adapter, a module the next step removes) and every test case.
     Then run `make check`. Its edits join the step's diff before review. Never on a move, rename
     or config step: a move keeps each file's content for `git` to see the rename.
3. **Review.** Every pass is a `reviewer` agent, which owns one kind of finding and reports each
   in one shape (its file says which and how). Call the Skill tool with
   `mattpocock-skills:code-review`, overriding:

   | code-review asks for | Use |
   |---|---|
   | the fixed point and diff | `HEAD`; the diff is `git diff HEAD` plus every untracked file in `git status --short`, so the uncommitted step is reviewed |
   | the spec | the step in `plan.md`, and the `R…` it cites from `feature.md`; the Spec axis also reports whether the diff changes what a quoted `R…` asks, which then requires the `feature.md` edit in the same diff, and names for each deleted statement, guard or check where it now lives, or reports it lost |
   | the standards | the rules `make review-rules` prints for the diff, and the `CLAUDE.md` of every touched workspace |
   | the sub-agents | the `reviewer` agent, once per axis, in parallel; the Standards axis on `model: sonnet`, the Spec axis on the agent's own |

   The Standards and Spec briefs also name the parts of `architecture.md` the step's own lines
   cite, each by its anchor, and no other: a `D…` it names (`- **D<n> —`), the Seam row its
   **Test first** names (the row's first words, under `## Seams`), a Contracts entry it names
   (its bold lead, under `## Contracts`). The Standards brief lists the standards by path and
   asks for each in the report with its findings or `none`; the shape is Depth's.

   A step that touches a write guard, a transaction, a test fake, concurrent access or error
   handling (a retry, a fallback) also gets the **hunt**: one `reviewer`, in parallel with the
   axes, on the same diff, briefed for correctness bugs and silent failures together; its sources
   are the diff's files, their callers and, for a test fake, the adapter it stands in for, and its
   word limit is the axes'. Any other step runs no hunt.

   A behaviour step also gets a **Depth** axis, the core of mattpocock's
   `improve-codebase-architecture` scoped to the step: a `reviewer` agent, in parallel with the
   others, on the diff's files and the modules that call them. It asks whether the shape is right
   (a shallow interface, a seam with one adapter, one concept spread over many files), in the
   vocabulary of `mattpocock-skills:codebase-design` and the nouns of
   `docs/knowledge/glossary.md`, judged by `.claude/rules/deep-modules.md` and
   `docs/knowledge/architecture.md`, and re-opens a decision of the ticket's `architecture.md`
   or of `docs/knowledge/decisions.md` only when the friction is real. It reports text only, each
   candidate in the finding's shape with `Strong`, `Worth exploring` or `Speculative` after its
   fix: no HTML report, no grilling, no glossary or ADR file.
4. **Decide and present.** You orchestrate: decide on the reports as they stand, without reading
   the code or the diff to restate a finding; a question that needs the code goes to a
   `researcher`, or to the reviewer that raised it (`SendMessage`). Present the implementer's
   report and what `simplify` changed, then the `## Standards` and `## Spec` reports as
   code-review aggregates them, then the hunt's findings, then the `## Depth` candidates, then
   the fixes you recommend. A Depth candidate inside the plan is a fix like any other; one that
   contradicts a decision or reshapes a module is the user's choice, asked as its own question.
   Filter the findings first: a fix that adds test support (a helper, a fake, a wrapper) is never
   forwarded as routine; offer the user a plainer test instead, or the finding as a choice of its
   own.
5. **Commit gate.** Once the step is ready, commit it as the session's answer says, or wait for
   the user's word:
   - **commit:** set the step's `Status: done` (or `blocked: <gate>` while a gate the step
     names, such as a branch, a push or a CI run, has not run yet) in the step and in its row
     of the plan's **Status** table, add its findings to `plan.md`
     and any new decision to `architecture.md`, with the record it adds or changes in
     `docs/knowledge/decisions.md`, stage the step's files, and commit with the
     proposed message as a command of its own. An amendment also rewrites the decision's body,
     Contract, Seam or Risks entry it makes wrong; its note keeps only what changed and the
     rejected alternative;
   - **feedback** (the user's, or the fixes you recommend): first commit the tree as it stands as
     the current round under the gate (`S11.1`, code only, no `plan.md` edit), then send the
     feedback to the same implementer (`SendMessage`) as the next round, each accepted finding
     forwarded as its reviewer wrote it, `path:line` first, and return to 3;
   - **stop:** leave the working tree as it is.
6. Name the next unblocked step.
