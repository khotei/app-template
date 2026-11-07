---
name: ticket-implement
description: "SDD 4/5: implement one plan.md step, commit its rounds, review them and close it under the commit gate. Run only when the user asks for this phase"
argument-hint: "<ticket folder> [step id | loop, default: next todo]"
---

Take one step of the ticket at `$ARGUMENTS` from `todo` to a commit; given `loop` in place of a
step id, take step after step, as **The loop** below says. Gates:
`.claude/rules/sdd.md`. Steps run in parallel change how steps 2 and 5 run: before them, read
[parallel-steps.md](parallel-steps.md) beside this file.

## Steps

1. **Pick the step:** the one named, else the first `todo` step whose `Blocked by` steps are all
   `done`. Of `plan.md`, read only the **Status** table and the step's own section. A step with
   no `#### S<n>` section of its own lies in a stage not yet prepared: even when it is named, do
   not run it; stop and name `/ticket-plan <ticket folder> next`.
   Check that the branch is the ticket branch (`<type>/<slug>`); otherwise stop and ask. Before
   anything else, run the **owner check** on each change `git status --short` shows, an
   untracked file included. At a run's start, before this session has changed anything, ask
   whose the changes are, since a stopped round looks the same: the user's commit as an `OWNER`
   round of the step whose files they change (`.claude/rules/commits.md › A ticket's rounds`),
   its body naming what changed and what it reaches, the callers and tests a search finds; a
   round the user names as the agent's stays in the tree for the implementer to finish. Later in
   the run, a change this session did not make commits as an `OWNER` round without asking.
2. **Implement.** Spawn the `implementer` agent with pointers only: the ticket folder and the
   step id, on the `model` and `effort` the step's **Model** line names (`opus medium` for a
   move, rename or config step; `opus high` for one that writes behaviour). You may choose `fable`
   over this default or any model named in steps 3 and 4 where you judge the result will be
   better for it, chiefly where a wrong answer passes every later check, and name it in the
   status. What it reads, what it leaves to you and how it reports are in its file; a brief does
   not repeat them. Its `make check` hook keeps it working until the gate is green. A report that
   starts with `BLOCKED:` goes straight to the user. At the session's first step outside a loop,
   ask the commit question of `.claude/rules/sdd.md › Gates` now, while the implementer works, and
   hold the answer; a later step does not ask again. Once `simplify` (below) and `make check` are
   done, stage every file the round changes, adds or deletes, untracked ones included
   (`git add -A`), and commit the round with the implementer's proposed message, named as
   `.claude/rules/commits.md › A ticket's rounds` says, before anything is presented.
   - **A new-interface step** is a behaviour step (below) whose diff adds an exported name, a
     module or a Seam. Simplify and Design run on it alone; any other step gets Standards and
     Spec, and the hunt where step 3 names it.
   - **A behaviour step**, whatever the **Model** line, is one whose diff changes the content of a
     `.ts` file, a `Makefile` recipe or a script, beyond a move. A move renames files whose
     content `git diff -M` shows unchanged and rewrites only the import and re-export lines
     (`from '<old path>'`) that name them. A move gets Standards and Spec alone.
   - **Simplify, a new-interface step only**, run by you, never by the implementer: the refactor that
     `tdd` leaves out of its red → green loop. Call the Skill tool with `simplify` on the
     implementer's uncommitted round, its args pointing at the step in `plan.md`, the rules
     `make review-rules` prints (which override it), and the deletion test and depth of
     `mattpocock-skills:codebase-design`; it keeps every test case.
     Then run `make check`. Its edits join the round before its commit.
3. **Review.** Every pass is a `reviewer` agent, which owns one kind of finding and reports each
   in one shape (its file says which and how). Spawn the passes in parallel, one `reviewer` each,
   its brief naming the pass, the diff, its sources and the word limit of 400, and nothing else:
   no question or focus of its own. The diff is the step's committed rounds, `git diff <base>
   HEAD`, where `<base>` is the parent of the oldest commit the subject search of `commits.md`
   finds for the step. Every step gets the two axes:

   - **Standards**, on `sonnet medium`: `make review-rules BASE=<base>`'s output, pasted
     verbatim with nothing added, and the `CLAUDE.md` of every touched workspace, each by its
     path; on a diff that touches an instruction file (a `CLAUDE.md`, a rule, a skill or an
     agent), also `mattpocock-skills:writing-for-agents`.
   - **Spec**, on `opus medium`: the step in `plan.md`, the **Files** and **Introduces**
     of the steps after it (its check of a step that does not stand alone:
     `.claude/agents/reviewer.md`), and the `R…` it cites from `feature.md`.

   Both briefs also name the parts of `architecture.md` the step's own lines cite, each by its
   anchor, and no other: a `D…` it names (`- **D<n> —`), the Seam row its **Test first** names
   (the row's first words, under `## Seams`), a Contracts entry it names (its bold lead, under
   `## Contracts`).

   A step other than a move that touches a write guard, a transaction, a test fake, concurrent
   access or error handling (a retry, a fallback) also gets the **hunt**, on `opus high`, on the
   same diff; its sources are the diff's files, their callers and, for a test fake, the adapter it
   stands in for. Any other step runs no hunt.

   A new-interface step also gets the **Design** pass, on `opus high`, on the same diff; its
   sources are the step id,
   the diff's files and the modules that call them, [design-examples.md](design-examples.md) by
   its path, `.claude/rules/deep-modules.md`, `docs/knowledge/architecture.md`, and the records
   of `docs/knowledge/decisions.md` and the ticket's `D…` that bind the diff's files.
4. **Decide and present.** You orchestrate: decide on the reports as they stand, without reading
   the code or the diff to restate a finding; a question that needs the code goes to a
   `researcher` on `opus high`, or to the reviewer that raised it (`SendMessage`). **Confirm
   first:** when a report holds a `claimed` finding, read [claimed-findings.md](claimed-findings.md)
   beside this file and settle each as it says before presenting any. A behaviour finding without
   a scenario and a `path:line` is not presented. A dispute over whether an instruction line
   changes what an agent does is not argued: a `researcher` runs the no-op experiment its file
   describes, on `sonnet medium`, and the line stays only when the two answers differ in what it
   asks. Present the round's commit, the implementer's report and what `simplify` changed, then
   the two axes' reports, each under its own heading
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
5. **Commit gate.** On a stage's last step, run **The stage close** below first. Once the step is
   ready (`.claude/rules/sdd.md › Gates`), close it as the session's answer says, or wait for the
   user's word:
   - **close:** run step 1's owner check, then set the step's `Status: done` (or
     `blocked: <gate>` while a gate the step names, such as a branch, a push or a CI run, has not
     run yet) in the step and in its row of the plan's **Status** table, write every finding the
     review raised in the step's **Findings**, each with its pass and fate in the shape of the
     plan template (one that states a check's result quotes the output it rests on), add any new
     decision to `architecture.md`, and commit them as the step's `PLAN` round, its body naming
     the passes that ran, as a command of its own; the decision's record in
     `docs/knowledge/decisions.md` landed with its round. An amendment also rewrites the
     decision's body, Contract, Seam or Risks entry it makes wrong; its note keeps only what
     changed and the rejected alternative;
   - **feedback** (the user's, or the fixes you recommend): run step 1's owner check, then send
     it to the same implementer (`SendMessage`) as the next round, each accepted finding
     forwarded as its reviewer wrote it, `path:line` first; commit its report's round as step 2
     does, under its source, its body opening with the fixed round's id, and return to 3;
   - **reject** (a round): run step 1's owner check, then revert the round or fix it forward as
     `.claude/rules/sdd.md › Gates` says; a revert is named as
     `.claude/rules/commits.md › A ticket's rounds` says (`git revert --no-commit`, then commit);
   - **stop:** leave the working tree as it is, and name a round left uncommitted in the status.
6. **Next.** Outside a loop, name the next unblocked step and end the turn. After a stage's close,
   name instead `/ticket-plan <ticket folder> next`, or `/ticket-verify <ticket folder>` after the
   last stage, and first `/ticket-verify <ticket folder> stage <n>` when that is **due** (below).
   In a loop, return to 1, but after a stage's close first run a due verification by reading
   `.claude/skills/ticket-verify/SKILL.md` afresh and following its `stage <n>` section, and,
   unless the stage was the last, read `.claude/skills/ticket-plan/stage.md` afresh and run it for
   the next stage until it has committed.

## The stage close

A plan with `## Stage <n>` headings and more than one stage closes each stage on the step whose
row is the last of its stage in the **Status** table, once that step's own passes are settled and
its rounds committed. A plan without stage headings, or of one stage, has no close and no stage
verification: `/ticket-verify` verifies it.

1. **The range** is `git diff <base> HEAD`, where `<base>` is the commit whose subject ends
   `St<n> (PLAN) Prepare stage <n>` (`git log --grep='<that text>$'`), not the facts commit
   before it; what you present names it.
2. **Simplify** it: call the Skill tool with `simplify`, its args naming that range, the rules
   `make review-rules BASE=<base>` prints and the deletion test and depth of
   `mattpocock-skills:codebase-design`, since without a range it reviews the whole branch. Run
   `make check`, then commit its edits as one `STAGE` round carrying the id of each step whose
   code they change.
3. **Review** the range as `## Steps` 3 briefs the passes, in parallel: **Standards** on
   `sonnet medium`, its brief also naming the `simplify` round's commit when it made one;
   **Design** on `opus high`, its sources also naming `architecture.md`, the plan's **Status**
   table (the skeleton) and the stage's `### Stage design`.
4. **Decide** on the findings and present them as `## Steps` 4 does. Each accepted fix goes to
   the last step's implementer, resumed by its agent id (`SendMessage`), or, when it was stopped,
   to a fresh `implementer` given that step's brief, on its **Model** line as step 2 says; the
   message names the **Files** and Traps of the steps whose code the fix changes. Its round
   commits as one `STAGE` round carrying the id of each of those steps, and this close's step 3
   runs again on the range. Each such fix round counts toward the last step's three fix rounds
   of **The loop**, whichever steps' code it changes.
5. **Record** every finding under the stage's `### Stage review`, in the shape of a step's
   **Findings**, in the last step's `PLAN` round (`## Steps` 5's **close**).

A stage verification is **due** when two stages have closed since the last `## Stage <k>` section
of `verification.md` (since the plan's start when there is none), or when the stage changed a
contract (an interface another module or a later stage uses) or `architecture.md`, its
preparation commit included. Outside a loop the user may run one for any stage.

## The loop

`loop` takes the unblocked `todo` steps one at a time, each through steps 1 to 5, under the
waiver of `.claude/rules/sdd.md › Gates`: each ready step closes, and the fixes you recommend
go to the implementer as the next round without asking. Step 4 defers its presentation to the
stop; each committed step adds a line (its id, its commits and the passes that ran) to what you
present when the loop stops, and each stage's close a line of its own (its range, its `STAGE`
rounds, the stage verification if one ran, the next stage's preparation commit).

At a stage's close, a Design finding that reshapes a module and contradicts no `D…` is a fix you
recommend, which the user reads afterwards by its `STAGE` commit; one that contradicts a `D…` is
recorded open under `### Stage review`, the user's choice, and presented at the loop's next stop
without causing one. The loop stops at the first of:

- a `BLOCKED:` report;
- a finding the user must decide, presented as step 4 says, a stage verification's failure that
  needs a requirement changed among them, but not a stage's Design finding held open above;
- a stage preparation with a question round, presented as `stage.md` returns it;
- a step not ready after three fix rounds, left as step 5's **stop** leaves it;
- the user's word to stop, which leaves the current round uncommitted;
- no unblocked `todo` step remains.
