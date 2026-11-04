---
name: ticket-implement
description: "SDD 4/5: implement one plan.md step, review it, and commit it under the commit gate"
argument-hint: "<ticket folder> [step id | loop, default: next todo]"
disable-model-invocation: true
---

Take one step of the ticket at `$ARGUMENTS` from `todo` to a commit; given `loop` in place of a
step id, take step after step, as **The loop** below says. Gates:
`.claude/rules/sdd.md`. Steps run in parallel change how steps 2 and 5 run: before them, read
[parallel-steps.md](parallel-steps.md) beside this file.

## Steps

1. **Pick the step:** the one named, else the first `todo` step whose `Blocked by` steps are all
   `done`. Of `plan.md`, read only the **Status** table and the step's own section, by `grep -n`
   and offset. Check that the branch is the ticket branch (`<type>/<slug>`) and that `git status`
   shows no uncommitted change to tracked files; otherwise stop and ask.
2. **Implement.** Spawn the `implementer` agent with pointers only: the ticket folder and the
   step id, on the `model` and `effort` the step's **Model** line names (`opus medium` for a
   move, rename or config step; `opus high` for one that writes behaviour). What it reads, what
   it leaves to you and how it reports are in its file; a brief does not repeat them. Its
   `make check` hook keeps it working until the gate is green. A report that starts with
   `BLOCKED:` goes straight to the user. At the session's first step outside a loop, ask the
   commit question of `.claude/rules/sdd.md › Gates` now, while the implementer works, and hold
   the answer; a later step does not ask again.
   - **Simplify, a behaviour step only**, run by you, never by the implementer: the refactor that
     `tdd` leaves out of its red → green loop. One test decides, whatever the **Model** line: a
     behaviour step's diff changes the content of a `.ts` file, a `Makefile` recipe or a script,
     beyond a move. A move renames files whose content `git diff -M` shows unchanged and rewrites
     only the import and re-export lines (`from '<old path>'`) that name them; it gets Standards
     and Spec alone, as does any step that is not a behaviour step. Call the Skill tool with
     `simplify` on the uncommitted step, its args pointing at the step in `plan.md`, the rules
     `make review-rules` prints (which override it), and the deletion test and depth of
     `mattpocock-skills:codebase-design`; it keeps every interim state the plan names (a
     delegating adapter, a module the next step removes) and every test case.
     Then run `make check`. Its edits join the step's diff before review.
3. **Review.** Every pass is a `reviewer` agent, which owns one kind of finding and reports each
   in one shape (its file says which and how). Call the Skill tool with
   `mattpocock-skills:code-review`, overriding:

   | code-review asks for | Use |
   |---|---|
   | the fixed point and diff | `HEAD`; the diff is `git diff HEAD` plus every untracked file in `git status --short`, so the uncommitted step is reviewed |
   | the spec | the step in `plan.md`, and the `R…` it cites from `feature.md`; the Spec axis also reports whether the diff changes what a quoted `R…` asks, which then requires the `feature.md` edit in the same diff, and names for each deleted statement, guard or check where it now lives, or reports it lost |
   | the standards | `make review-rules`'s output for the diff, pasted verbatim with nothing added, and the `CLAUDE.md` of every touched workspace; on a diff that touches an instruction file (a `CLAUDE.md`, a rule, a skill or an agent), also `mattpocock-skills:writing-for-agents` |
   | the smell baseline | none: the shape is Design's |
   | the sub-agents | the `reviewer` agent, once per axis, in parallel; the Standards axis on `model: sonnet`, the Spec axis on the agent's own |

   The Standards and Spec briefs also name the parts of `architecture.md` the step's own lines
   cite, each by its anchor, and no other: a `D…` it names (`- **D<n> —`), the Seam row its
   **Test first** names (the row's first words, under `## Seams`), a Contracts entry it names
   (its bold lead, under `## Contracts`). The Standards brief lists the standards by path and
   asks for each in the report with its findings or `none`. Every brief
   names its sources and nothing else: no question or focus of its own.

   A step that touches a write guard, a transaction, a test fake, concurrent access or error
   handling (a retry, a fallback) also gets the **hunt**: one `reviewer`, in parallel with the
   axes, on the same diff; its sources are the diff's files, their callers and, for a test fake,
   the adapter it stands in for, and its word limit is the axes'. Any other step runs no hunt.

   A behaviour step also gets the **Design** pass: one `reviewer`, in parallel with the others,
   on the same diff; its sources are the step id, the diff's files and the modules that call
   them, [design-examples.md](design-examples.md) by its path, `.claude/rules/deep-modules.md`,
   `docs/knowledge/architecture.md`, and the records of `docs/knowledge/decisions.md` and the
   ticket's `D…` that bind the diff's files, and its word limit is the axes'.
4. **Decide and present.** You orchestrate: decide on the reports as they stand, without reading
   the code or the diff to restate a finding; a question that needs the code goes to a
   `researcher`, or to the reviewer that raised it (`SendMessage`). **Confirm first:** when a
   report holds a `claimed` finding, read [claimed-findings.md](claimed-findings.md) beside this
   file and settle each as it says before presenting any. A behaviour finding without a scenario
   and a `path:line` is not presented. A dispute over whether an instruction line changes what an
   agent does is not argued: a `researcher` runs the no-op experiment its file describes, and the
   line stays only when the two answers differ in what it asks. Present the implementer's report
   and what `simplify` changed, then the `## Standards` and `## Spec` reports as code-review
   aggregates them, then the hunt's findings, then the Design candidates, then the fixes you
   recommend. A Design candidate inside the plan is a fix like any other; one that
   contradicts a decision or reshapes a module is the user's choice, asked as its own question.
   Filter the findings first: a fix that adds test support (a helper, a fake, a wrapper) is never
   forwarded as routine; offer the user a plainer test instead, or the finding as a choice of its
   own. A finding that fails one of the ticket's `R…` is a fix you recommend for the step's next
   round; only a finding outside them may stay `accepted, open`. Each finding the user must
   decide on is one block, ending in its question: what is wrong, what it leads to, the options
   with their cost, your recommendation, then the question; never the findings in one section and
   the questions in another.
5. **Commit gate.** Once the step is ready (`.claude/rules/sdd.md › Gates`), commit it as the
   session's answer says, its body naming the passes that ran, or wait for the user's word:
   - **commit:** set the step's `Status: done` (or `blocked: <gate>` while a gate the step
     names, such as a branch, a push or a CI run, has not run yet) in the step and in its row
     of the plan's **Status** table, write every finding the review raised in the step's
     **Findings**, each with its pass and fate in the shape of the plan template (one that
     states a check's result quotes the output it rests on), add any new decision to
     `architecture.md`, with the record it adds or changes in `docs/knowledge/decisions.md`,
     stage the step's files, and
     commit with the proposed message as a command of its own. An amendment also rewrites the
     decision's body, Contract, Seam or Risks entry it makes wrong; its note keeps only what
     changed and the rejected alternative;
   - **feedback** (the user's, or the fixes you recommend): commit the round first
     (`.claude/rules/sdd.md › Gates`), then send the feedback to the same implementer
     (`SendMessage`) as the next round, each accepted finding forwarded as its reviewer wrote it,
     `path:line` first, and return to 3;
   - **stop:** leave the working tree as it is.
6. Name the next unblocked step and end the turn; in a loop, return to 1 instead.

## The loop

`loop` takes the unblocked `todo` steps one at a time, each through steps 1 to 5, under the
waiver of `.claude/rules/sdd.md › Gates`: each ready step commits, and the fixes you recommend
go to the implementer as the next round without asking. Step 4 defers its presentation to the
stop; each committed step adds a line (its id, its commits and the passes that ran) to what you
present when the loop stops, at the first of:

- a `BLOCKED:` report;
- a finding the user must decide, presented as step 4 says;
- a step not ready after three fix rounds, left as step 5's **stop** leaves it;
- the user's word to stop, which leaves the current round uncommitted;
- no unblocked `todo` step remains.
