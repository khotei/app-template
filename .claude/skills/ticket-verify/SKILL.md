---
name: ticket-verify
description: "SDD 5/5: verify a whole ticket, or one of its stages, in a fresh context into verification.md with Lessons. Run only when the user asks for this phase"
argument-hint: "<ticket folder> [stage <n>]"
---

Verify the ticket at `$ARGUMENTS` before its PR: does the branch do what `feature.md` asks, and
what should the toolkit learn from building it. With `stage <n>`, verify one stage instead, as
its section below says. Gates: `.claude/rules/sdd.md`.

## Steps

1. **Run the checks in parallel**, passing pointers only: a brief names its sources and nothing
   else, no question of its own, no summary of how the work was done, and no `plan.md` for a
   verifier. The fixed point is the merge-base of `HEAD` with the PR's base branch (`main` while
   no PR exists); before spawning, check that `git rev-parse <fixed point>` resolves and
   `git diff <fixed point>...HEAD` is not empty, else stop and tell the user:
   - split `feature.md`'s requirements into groups by its `###` sections, and put every
     requirement whose acceptance starts the apps, runs `make test-e2e` or writes a probe into the
     tree in one group, whose verifier also runs `make check` (it runs the e2e too), since the
     verifiers share the tree, its ports and its containers; spawn one `verifier` per group, on
     `opus high`, with the ticket folder, the branch, the fixed point and its `R…` ids;
   - spawn one `reviewer` per axis, each brief naming its pass, the diff
     `git diff <fixed point>...HEAD` and the word limit of 400: **Standards**, on
     `sonnet medium`, with the standards `.claude/rules/*.md` plus the touched `CLAUDE.md` files;
     **Spec**, on `opus high`, with `feature.md` plus `architecture.md`. The Spec pass reads every
     requirement at once, so a gap between two groups still shows.

   Tell every agent to read the rules, `CLAUDE.md` files, skills and agents from disk: agents
   spawned in a long session can carry the copies loaded when it started. After rule edits, prefer
   running `/ticket-verify` in a new session.
2. **Write `verification.md`** from `docs/tickets/_template/verification.md`, appending a dated
   section per run: the verdicts merged from every group (`pass` only when every group passes),
   the per-stage table of a plan in stages, the **Review ledger**, the Standards and Spec reports,
   ranked simplifications, and **Lessons**. You sum the ledger yourself, per pass, from each
   step's **Findings** in `plan.md`, since no verifier reads `plan.md`; a fix counts as accepted
   too, and a step with no findings adds nothing. You sum the per-stage table too, a row per stage
   from its `### Stage review`, its steps' **Findings**, its `## Stage <n>` sections of
   `verification.md` and `git log -p -- plan.md`: the deviations that changed a step's outcome or
   order, those that changed only details, the edits made to later steps, and whether the loop
   stopped at its close.
3. **Lessons.** Collect the mistakes that recurred in two or more steps: `plan.md` findings,
   review rounds, and the user's feedback in this session. Each lesson names where it recurred
   and what it cost (rounds, time, a wrong result), and proposes one line in a named skill or
   rule, or a mechanical check (a Biome rule, a test, a hook) when the mistake is mechanical;
   never in a `CLAUDE.md`. Apply a lesson only on the user's OK.
4. **Present** the verdict, the simplifications and the lessons, then each `feature.md › Later`
   item still `open`, each a question: done as a step, a roadmap entry, or dropped. Accepted
   fixes become new `plan.md` steps for `/ticket-implement`; on a ticket that changes only
   `.claude/` or `docs/`, they land without a second `/ticket-verify` unless one changes what a
   requirement asks ([the cycles](../../../docs/knowledge/sdd.md#when-to-run-which-cycle)). On
   `pass` and the user's agreement, propose the PR (`.claude/rules/pull-requests.md`).

Fix nothing during a whole-ticket run. Commit `verification.md`, and open the PR, under the
commit gate of `.claude/rules/sdd.md`.

## `stage <n>`

Verify what stage `<n>` built before a later stage rests on it. A plan without `## Stage`
headings has no `Completed in`: stop and say so.

1. **Pick the requirements.** First run the owner check of `/ticket-implement`'s step 1 on the
   tree, so the user's edits land inside the range. The stage's range starts at its base, the
   fixed point: the commit
   whose subject ends `St<n> (PLAN) Prepare stage <n>` (`git log --grep='<that text>$'`). It ends
   at the parent of the commit whose subject ends `St<n+1> (PLAN) Prepare stage <n+1>` when one
   exists, else at `HEAD`. Check that `git rev-parse <fixed point>` resolves and
   `git diff <fixed point>...<end>` is not empty, else stop and tell the user. The requirements
   are those whose `Completed in` in `plan.md › Requirement coverage` is stage `<n>`, and each
   one completed earlier whose steps' commits (the subject search of
   `.claude/rules/commits.md › A ticket's rounds`) touched a file
   `git diff --name-only <fixed point>...<end>` lists.
2. **Verify** them, grouped and briefed as `## Steps` 1 does, each brief naming the range's end
   too, the verifiers on `opus high`, or `xhigh` for a stage over ~30 minutes of work. No
   reviewer, since the stage's close reviewed its diff, and no lessons, which stay with the
   whole-ticket run. The step is done when every requirement of the list has a `pass`, `fail` or
   `not verifiable` verdict.
3. **Fix a `fail`** before anything else runs: spawn an `implementer` with the ticket folder, the
   id of the step whose code the fix changes and the verifier's evidence, on the step's
   **Model** line, `opus high` when it names none. It is a `VERIFY` round of that step, committed
   under the commit gate and the round rule of `.claude/rules/sdd.md`. Then verify only the
   failed requirements again, on the same range, each brief also naming the `VERIFY` round's
   commits. A failure that needs a requirement changed is the user's question: present it and
   stop.
4. **Append** `## Stage <n> — <date>` to `verification.md`, in the template's shape: the verdict
   per requirement and the rounds that fixed a failure. Commit it under the commit gate, named as
   `.claude/rules/commits.md` says.

## The models

Each spawn above names its default model and effort. You may choose `fable` over any of them
where you judge the result will be better for it, chiefly where a wrong answer passes every later
check, and name it in the status.
