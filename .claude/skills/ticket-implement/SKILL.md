---
name: ticket-implement
description: "SDD 4/5: implement one plan.md step, review it, and commit it under the commit gate. Run only when the user asks for this phase"
argument-hint: "<ticket folder> [step id | loop, default: next todo]"
---

Take one step of the ticket at `$ARGUMENTS` from `todo` to a commit; given `loop` in place of a
step id, take step after step, as **The loop** below says. Gates:
`.claude/rules/sdd.md`. Steps run in parallel change how steps 2 and 5 run: before them, read
[parallel-steps.md](parallel-steps.md) beside this file.

## Steps

1. **Pick the step:** the one named, else the first `todo` step whose `Blocked by` steps are all
   `done`. Of `plan.md`, read only the **Status** table and the step's own section.
   Check that the branch is the ticket branch (`<type>/<slug>`) and that `git status`
   shows no uncommitted change to tracked files; otherwise stop and ask.
2. **Implement.** Spawn the `implementer` agent with pointers only: the ticket folder and the
   step id, on the `model` and `effort` the step's **Model** line names (`opus medium` for a
   move, rename or config step; `opus high` for one that writes behaviour). What it reads, what
   it leaves to you and how it reports are in its file; a brief does not repeat them. Its
   `make check` hook keeps it working until the gate is green. A report that starts with
   `BLOCKED:` goes straight to the user. At the session's first step outside a loop, ask the
   commit question of `.claude/rules/sdd.md › Gates` now, while the implementer works, and hold
   the answer; a later step does not ask again.
   - **A new-interface step** is a behaviour step (below) whose diff adds an exported name, a
     module or a Seam. Simplify and Design run on it alone; any other step gets Standards and
     Spec.
   - **A behaviour step**, whatever the **Model** line, is one whose diff changes the content of a
     `.ts` file, a `Makefile` recipe or a script, beyond a move. A move renames files whose
     content `git diff -M` shows unchanged and rewrites only the import and re-export lines
     (`from '<old path>'`) that name them. A move gets Standards and Spec alone.
   - **Simplify, a new-interface step only**, run by you, never by the implementer: the refactor that
     `tdd` leaves out of its red → green loop. Call the Skill tool with `simplify` on the
     uncommitted step, its args pointing at the step in `plan.md`, the rules `make review-rules`
     prints (which override it), and the deletion test and depth of
     `mattpocock-skills:codebase-design`; it keeps every test case.
     Then run `make check`. Its edits join the step's diff before review.
3. **Review.** Every pass is a `reviewer` agent, which owns one kind of finding and reports each
   in one shape (its file says which and how). Spawn the passes in parallel, one `reviewer` each,
   its brief naming the pass, the diff, its sources and the word limit of 400, and nothing else:
   no question or focus of its own. The diff is `git diff HEAD` plus every untracked file in
   `git status --short`, so the uncommitted step is reviewed. Every step gets the two axes:

   - **Standards**, on `model: sonnet`: `make review-rules`'s output for the diff, pasted
     verbatim with nothing added, and the `CLAUDE.md` of every touched workspace, each by its
     path; on a diff that touches an instruction file (a `CLAUDE.md`, a rule, a skill or an
     agent), also `mattpocock-skills:writing-for-agents`.
   - **Spec**, on the agent's own model: the step in `plan.md`, the **Files** and **Introduces**
     of the steps after it (its check of a step that does not stand alone:
     `.claude/agents/reviewer.md`), and the `R…` it cites from `feature.md`.

   Both briefs also name the parts of `architecture.md` the step's own lines cite, each by its
   anchor, and no other: a `D…` it names (`- **D<n> —`), the Seam row its **Test first** names
   (the row's first words, under `## Seams`), a Contracts entry it names (its bold lead, under
   `## Contracts`).

   A step other than a move that touches a write guard, a transaction, a test fake, concurrent
   access or error handling (a retry, a fallback) also gets the **hunt** on the same diff; its
   sources are the diff's files, their callers and, for a test fake, the adapter it stands in
   for. Any other step runs no hunt.

   A new-interface step also gets the **Design** pass on the same diff; its sources are the step id,
   the diff's files and the modules that call them, [design-examples.md](design-examples.md) by
   its path, `.claude/rules/deep-modules.md`, `docs/knowledge/architecture.md`, and the records
   of `docs/knowledge/decisions.md` and the ticket's `D…` that bind the diff's files.
4. **Decide and present.** You orchestrate: decide on the reports as they stand, without reading
   the code or the diff to restate a finding; a question that needs the code goes to a
   `researcher`, or to the reviewer that raised it (`SendMessage`). **Confirm first:** when a
   report holds a `claimed` finding, read [claimed-findings.md](claimed-findings.md) beside this
   file and settle each as it says before presenting any. A behaviour finding without a scenario
   and a `path:line` is not presented. A dispute over whether an instruction line changes what an
   agent does is not argued: a `researcher` runs the no-op experiment its file describes, and the
   line stays only when the two answers differ in what it asks. Present the implementer's report
   and what `simplify` changed, then the two axes' reports, each under its own heading
   (`## Standards`, `## Spec`) as its reviewer wrote it, then the hunt's findings, then the
   Design candidates, then the fixes you recommend. A Design candidate inside the plan is a fix
   like any other; one that contradicts a decision or reshapes a module is the user's choice,
   asked as its own question.
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
