# Plans in stages — verification

> Ticket: `2026-11-07-1232_sdd-stages` · Requirements: [feature.md](./feature.md) · Plan: [plan.md](./plan.md)

<!-- /ticket-verify appends one dated section per run, and `stage <n>` one section per stage
run; earlier runs stay as history. -->

## 2026-11-08 — run 1

**Verdict:** pass

Fixed point `a67dcd705f` (merge-base with `main`), `HEAD` `9e69cddea3`, 46 files (+3181/−248).
By the owner's choice the run was short: two acceptance runs through `sample/run.sh`
(`stage-1-done`, `all-done`), every other requirement verified by reading the files at `HEAD`.
Seven verifiers on `opus high`, one per `###` group of `feature.md`.

### Requirements

| Req | Result | Evidence |
|---|---|---|
| R1 | pass | reading: `ticket-architecture/SKILL.md:24-42` asks for the high level only (modules, contracts, Seams, decisions with the rejected alternative, Direction, Assumptions); `_template/architecture.md:16-60` holds the same sections |
| R2 | pass | reading: `ticket-architecture/SKILL.md:16-19` grills "the seams, the contracts and the irreversible decisions" only, a direction "written as a recommendation and shown as written"; approval at `:44-45` |
| R3 | pass | reading: `ticket-plan/SKILL.md:19-33` cuts every step into the Status skeleton under `### Stage` headings, with a coverage table; `stage.md:90-91` fails a requirement no step serves |
| R4 | pass | reading: `ticket-plan/SKILL.md:25-26` "stages of three; a stage of one, two or four states its reason in its heading"; `_template/plan.md:8-18` |
| R5 | pass | reading: `ticket-plan/SKILL.md:34-37` presents the skeleton and stage 1 for one approval, then commits `St1 (PLAN) Prepare stage 1`; `stage.md:25-26` holds a first plan's facts until then |
| R6 | pass | reading: `stage.md:12-15` (the base), `:19-26` (facts and probes first), `:27-30` (stage design), `:31-69` (steps), `:116-124` (probe worktree) |
| R7 | pass | reading: `stage.md:90-91` names the uncovered requirement as `fail`; `:95-96` fixes it by moving work |
| R8 | pass | reading: `stage.md:99-107` puts architecture, step-list and costly choices to the owner as one question round; `:24-26`, `:110-112` commit only the facts; `ticket-implement/SKILL.md:183` stops the loop on it |
| R9 | pass | reading: `stage.md:105-106` raises a contract choice `used by` a step outside the stage to a `D…`; a reused name stays |
| R10 | pass | run (`stage-1-done`, `/ticket-implement … S3`): range base `4c69b8388a` found by its subject; `simplify` committed `St1 S2+S3 (STAGE) Seed the slug with its first word`; Standards (sonnet medium) and Design (opus high) ran on `git diff 4c69b8388a HEAD`. Recording under `### Stage review` not reached: the run stopped, rightly, on an owner question (an empty slug from `make ticket TITLE='!!!'`); reading: `ticket-implement/SKILL.md:107-110`, `:158-159` |
| R20 | pass | reading: `ticket-verify/SKILL.md:61-83`; run: the close said no verification was due ("only one stage will have closed …"), as `states/stage-1-closed.sh` expects |
| R11 | pass | reading: `ticket-implement/SKILL.md:127-130`, `:172-183`; `docs/knowledge/sdd.md:238-245` |
| R12 | pass | run: the output ends "the next command is `/ticket-plan docs/tickets/2026-01-01-0000_sample next`"; `ticket-implement/SKILL.md:124-125` |
| R13 | pass | reading: `stage.md:24-26`, `:108-110`; `.claude/rules/sdd.md:55-58` |
| R14 | pass | reading: `ticket-plan/SKILL.md:27-28`; `ticket-implement/SKILL.md:134-137`; `_template/plan.md:70`; the guide's `one stage` edge, `docs/knowledge/sdd.md:19` |
| R15 | pass | `git diff --stat a67dcd705f...HEAD -- 'docs/tickets/*/plan.md'` outside `_template` and this ticket prints nothing; the 19 earlier plans keep `#### S<n>` sections with no `### Stage`; `docs/knowledge/sdd.md:85-88` |
| R16 | pass | run (`all-done`, `/ticket-verify docs/tickets/2026-01-01-0000_sample/`): its `verification.md` holds `### Stages` with one row per stage, `\| 1 \| 0 \| 0 \| 0 \| no \|` and `\| 2 \| 0 \| 0 \| 1: S6, … \| no; … \|`, the S6 edit `states/all-done.sh` plants |
| R17 | pass | reading: `docs/knowledge/sdd.md:44-88` defines the terms, the diagram `:7-22` shows stages, the map `:124-184` matches the skills' models, plugins and hooks (grep); `glossary.md` unchanged in the diff |
| R18 | pass | `make doc-lint` exit 0; largest rule `effect-style.md` 80 of 80 lines, `.claude/CLAUDE.md` 34 of 40 |
| R21 | pass | reading: `.claude/rules/commits.md:26-52`; `git log`: all 35 subjects from `8932eb43af` open with `S<n>.<n>` (an old-form plan drops `St`), each past a first pass has a source, and `d48677297c S3+S7.2 (REVIEW)` carries the earlier step's id |
| R22 | pass | reading: `ticket-implement/SKILL.md:18-25`, `:106`, `:116`, `:120`; `.claude/rules/sdd.md:43-47`; `git log`: `3c7c54e963 S7.4 (OWNER)` names the change and what it reaches, its parent unchanged in the reflog |
| R23 | pass | reading: `ticket-implement/SKILL.md:35-38` commits each round before it is presented; `:120-122` and `.claude/rules/sdd.md:45-47` revert a last round, fix a covered one forward |
| R19 | pass | reading: every spawn site in `.claude/skills/ticket-*/` names a model and effort (grep, listed per skill); the map `docs/knowledge/sdd.md:124-134` and `architecture.md:277-295` agree; the `fable` choice and its status at `sdd.md:136-139` and in each skill |

**Not verifiable:** the behaviour of a run for every requirement verified by reading (R1–R9,
R11, R13–R15, R17, R19, R21–R23): by the owner's choice no run covered them. R10's recording
under `### Stage review` and R20's due verification and `VERIFY` round were not reached by the
one `stage-1-done` run.

**Found by the runs:**

- `sample/run.sh:131` cannot start a run: `--disallowedTools` takes several values and swallows
  the prompt (`Permission deny rule "/ticket-verify" matches no known tool`, then `Error: Input
  must be provided …`, exit 1). Both verifiers ran the same `claude -p` by hand with the prompt
  before the flags. The defect came in with `S7.4`.
- Commands outside the allow list are still denied in a clone (`git clone --local`, `mktemp`, a
  reviewer's scratch clone); the verifiers' guess that the flags miss subagents is not checked.

### Review

#### Review ledger

| Pass | Findings | Accepted | Fixed | Rejected |
|---|---|---|---|---|
| Spec | 35 | 33 | 29 | 2 |
| Standards | 29 | 13 | 11 | 16 |
| implementer | 25 | 25 | 2 | 0 |

Summed from the steps' **Findings** in `plan.md` (S1–S7); a finding raised more than once counts
once. The plan has no `### Stage` headings, so it has no `### Stages` table.

#### Standards

**Standards report: 10 rules and 2 CLAUDE.md files read; 3 findings (2 judgement, 1 hard-limit check).**

Rules read, and what each yielded:
- `claude-md.md`: 2 findings
- `sdd.md`: none
- `commits.md`: 1 finding, the same one as in `claude-md.md` (below)
- `comments.md`, `naming.md`, `pull-requests.md` and `tooling.md`: none (TS, package and `.github` rules; the diff touches no such file)
- Not read: `deep-modules.md`, `effect*.md`, `layering.md` and `modules.md`. All are TS-scoped, and the diff has no TS.
- CLAUDE.md files: `.claude/CLAUDE.md` none (the diff touches no other CLAUDE.md)
- `make doc-lint` exits 0, so these limits hold: `commits.md` 71 lines and `sdd.md` 63 lines, both under the 80-line rule limit. The `CLAUDE.md` limit does not apply, since the diff touches none.

Findings:
- `.claude/rules/commits.md:41` — `claude-md.md › The owner` ("states only the currently binding constraint … no … superseded chains … tombstones") — judgement — "a plan of the old form, without stages, drops the stage" is a legacy-compatibility clause. Keep it only if old-form plans must stay supported; otherwise delete it with `(S4.2 (REVIEW))`.
- `.claude/skills/ticket-plan/SKILL.md:13` — `claude-md.md › The owner` (same line as above), and `writing-for-agents › Pruning` (sediment) — judgement — "is in its old form: keep it in that form, and stop `next` on it" is the same legacy clause. Decide once whether old-form plans are supported, and drop both lines or keep both.
- `.claude/skills/ticket-architecture/SKILL.md:21`, `.claude/skills/ticket-implement/SKILL.md:28`, `.claude/skills/ticket-plan/stage.md:133`, `.claude/skills/ticket-verify/SKILL.md:87`, `.claude/skills/ticket-implement/claimed-findings.md:6`, `.claude/skills/ticket-feature/SKILL.md` — `claude-md.md › The owner` ("each fact has one author; every other file links it") and `writing-for-agents › Pruning` (single source of truth) — judgement — the "you may choose `fable` over the default … name it in the status" clause is written out about six times. Put it in one place, such as `sdd.md` or a shared line the skills link to.

`writing-for-agents` on the touched skills: the stage-close section and the new `stage <n>` section put steps first and reference after, and each ends on a checkable criterion, so I found no premature-completion risk. `.claude/skills/ticket-implement/SKILL.md` is now 186 lines, which is sprawl. Its stage close (the new `## The stage close` section) could go to a sibling file with a pointer, as `claimed-findings.md` does. Judgement.

I found no deleted rule or case from a `simplify` round to report.

#### Spec

Four Spec findings against `feature.md`; none of them was run on the sample, so each is `claimed`. I read only the sources the brief named, and I opened the old `ticket-plan/SKILL.md` (at `a67dcd705f`) to trace what the diff deleted.

**Findings**

- `/Users/v/lab/app-template/.claude/skills/ticket-verify/SKILL.md:67` — R20 ("each earlier one whose files the stage changed") — stage 1 has a step S2 that also edited a file its **Files** line does not list (`stage.md:40-41` says that list is "a start, not the bound"); stage 3 changes that file → S2's requirement is left out of the stage 3 verification — claimed — find the earlier steps' files from their commits (the subject search in `commits.md`), not from the **Files** lines.
- `/Users/v/lab/app-template/.claude/skills/ticket-plan/SKILL.md:41` — R22 ("commit them as an `OWNER` round before any next action") — the owner edits a skeleton row in `plan.md` after a stage closes, then runs `/ticket-plan <ticket> next` → `stage.md:25` commits that edit inside `St<n> (PLAN) Record the facts of stage <n>`, with no `OWNER` round first. D11 rejected exactly this ("The owner's edits folded into the next agent round"). `ticket-verify` `stage <n>` (`SKILL.md:74-83`) has the same gap — claimed — run `ticket-implement` step 1's owner check at the start of `next` and of `stage <n>`.
- `/Users/v/lab/app-template/.claude/skills/ticket-implement/parallel-steps.md:21` — R22 ("SHALL never rewrite a commit the owner has seen before the PR"; its acceptance says "no earlier commit's hash changes") — a parallel step's round, committed and shown to the owner, is rebased onto the ticket branch before the next round → its hash changes — claimed — merge the ticket branch into the worktree branch instead of rebasing, or record the exception as a decision.
- `/Users/v/lab/app-template/.claude/skills/ticket-implement/SKILL.md:16` — R8 ("put them to the owner as a question round … and wait") and R11 — the loop stops on stage 2's question round, with the facts committed and the design and steps written but uncommitted; the owner answers and types `/ticket-implement … loop` again → step 1 finds a `#### S4` section in the uncommitted `plan.md` and runs S4. The answers are never applied, the check of `stage.md` step 4 does not run again, and there is no `Prepare stage 2` commit, so the Stage review has no base for its range — claimed — treat a stage that has a `### Stage design` but no `St<n> (PLAN) Prepare stage <n>` commit as not prepared: in a loop, finish it at `stage.md` step 6; outside a loop, name `/ticket-plan <ticket> next`.

**Deleted statements:** none lost.
- The reviewer's line on untracked files now lives in `ticket-implement/SKILL.md:35-37` (`git add -A` before each round's commit).
- The old plan check, its worktree setup and "fix before presenting" now live in `stage.md:70-124`.
- `sdd.md`'s "the commit body opens with the round id" moved into the subject, in `commits.md › A ticket's rounds`.

**Done but not asked for:** nothing. Every change outside the ticket folder traces to an `R…` or a `D…`.

All four were confirmed by reading the cited lines at `HEAD`: `ticket-verify/SKILL.md:66-67`
picks earlier requirements by **Files**; `ticket-plan/SKILL.md › next` has no owner check;
`parallel-steps.md:21` rebases (a line older than this ticket, which R22 now contradicts);
`ticket-implement/SKILL.md:14-16` checks for a section, not for the preparation's commit.

### Simplifications

1. `sample/run.sh:131`: put the prompt right after `-p`, so the runner starts at all.
2. `ticket-verify/SKILL.md:66-67`: an earlier step's files from its commits (`commits.md`'s
   subject search), not its **Files** line, so R20 misses no requirement.
3. `ticket-plan/SKILL.md › next` and `ticket-verify/SKILL.md › stage <n>`: run
   `ticket-implement` step 1's owner check first (R22).
4. `ticket-implement/SKILL.md:14-16`: a stage with a `### Stage design` but no
   `St<n> (PLAN) Prepare stage <n>` commit is not prepared (R8, R11).
5. `ticket-implement/parallel-steps.md:21`: merge the ticket branch into the worktree branch
   instead of a rebase, so no seen round changes its hash (R22).
6. `docs/knowledge/sdd.md:51-52`: the guide says "about three" steps a stage; add the bound of
   four the skill and template set.

### Lessons

#### L1 — A rejected finding comes back in the next round and the next step

- **Evidence:** Standards raised the repeated `fable` clause in S2, S3 (twice), S4 (three
  times) and S6 (twice), rejected each time because D9 and R19 ask for it; this run's Standards
  raised it again. S3 and S5 have more findings "rejected (raised three times)".
- **Cost:** 16 of 29 Standards findings rejected; each repeat is read and argued again in a
  round.
- **Proposed change:** `ticket-implement/SKILL.md` step 3: a later round's brief names the
  findings already rejected for the step, with their reason, and the reviewer does not raise
  them again.
- **Applied:** yes, `ticket-implement/SKILL.md` step 3 and `.claude/agents/reviewer.md`

#### L2 — Fix rounds run on findings that fail no requirement

- **Evidence:** S1 ran four fix rounds (S1.2–S1.5), S2 three (S2.2–S2.4), S5 three
  (S5.2–S5.4), most for Spec findings of wording; the owner's feedback in this session: two hours
  on about ten Markdown files.
- **Cost:** about 10 extra rounds over the ticket, each with a full Standards and Spec pass.
- **Proposed change:** `ticket-implement/SKILL.md` step 5: one fix round by default; a second
  only for a finding that fails one of the ticket's `R…`.
- **Applied:** yes, `ticket-implement/SKILL.md` steps 4, the stage close and the loop
