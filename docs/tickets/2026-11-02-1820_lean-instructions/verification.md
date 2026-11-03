# Lean instructions — verification

> Ticket: `2026-11-02-1820_lean-instructions` · Requirements: [feature.md](./feature.md) · Plan: [plan.md](./plan.md)

<!-- /ticket-verify appends one dated section per run; earlier runs stay as history. -->

## 2026-11-03 — run 1

**Verdict:** fail

Run from the main session that implemented S8–S13, on the user's "go", not in a new session.
The fixed point is `refactor/modular-monolith`, the PR's base, not `git merge-base HEAD
origin/main`, which would review all of PR #15. Three verifiers (R1–R11, R12–R16, R17–R23) and
the two review axes started together at 12:49 and all reported by 13:00 local time.

### Requirements

| Req | Result | Evidence |
|---|---|---|
| R1 | fail | Probe: `application/chat` moved to `application/conversation`, `chat.service.ts` renamed; the grep over every `CLAUDE.md`, rule, skill and agent finds nothing. `make doc-names` fails on `architecture.md:143–150` (› Where things live) and also on `architecture.md:126` (`application/chat/index.ts`, › Imports); the acceptance, amended in S12.2, allows only the first. |
| R2 | fail | Eight of nine facts have one owner and pointers. The root `CLAUDE.md:16` restates `bun add [-d] --catalog=<namespace> <pkg>@<exact>`, which `tooling.md › Add a dependency` owns; S9 kept it on purpose, but neither `feature.md` nor the owners table records the exception. `/doctor prompt-audit` not run (no agent can run it). |
| R3 | not verifiable | Its acceptance is the step ledgers and their review, in `plan.md`, which a verifier does not read. The step reviews checked each ledger. |
| R4 | pass | `git grep -nP '\b[0-9]+\.[0-9]+\.[0-9]+\b'` over `docs/knowledge` and every `README.md` hits only the roadmap's dated history; "today" and counts sit in their owners or are stable structure. |
| R5 | not verifiable | As R3. Traps seen in place: `effect.md:8,32`, `effect-tests.md:37,55,68`, `application/CLAUDE.md:11`, `http-api/CLAUDE.md:16`, `deployment/CLAUDE.md:8,13`. |
| R6 | pass | `deployment/local/README.md` is gone; the root `README.md` is the only `README.md` outside the tickets, and it links its owners. |
| R7 | pass | Planted paths in a skill, an agent, the root `README.md` and an untracked `README.md`: `make check` stops at `doc-names`, naming each file and line. (The roadmap is skipped by design; see the Spec report.) |
| R8 | pass | Source paths planted in a rule, a `CLAUDE.md` and a skill fail with "write the pattern"; a placeholder, a package specifier and a `docs/knowledge` pointer beside them pass. |
| R9 | pass | A filter to a gone folder, a brace filter and an inline `paths:` list each fail `make rule-paths`, naming rule and filter. |
| R10 | pass | Green on the tree (`effect-style.md` at 80); a rule at 83 and a `CLAUDE.md` at 44 fail `make doc-limits`, naming file and length. |
| R11 | pass | `claude-md.md` holds the test (:14–24), the owner (:26–43), the pattern (:45–52) and names `make doc-limits`, `make doc-names`, `make rule-paths` (:56–60). |
| R12 | pass | Spec reviewer's design reading, mean of two runs: 4 195 B → 2 496 B, −40% (`s1/r12c,d` → `s3/r12c,d`); the brief on HEAD is the one measured. Each of four Standards reports names all 13 bound rules. |
| R13 | fail | Load: 12 452 → 9 901 tok at HEAD, −20.5%; all 13 rules load through `path_glob_match`. But the replay's implementer read about 12 files with `cat`, `sed -n` or `head` through Bash despite `implementer.md`'s "never `cat`, `sed`"; S8's finding called those calls "`git rm` and a temp log". |
| R14 | pass | 10 451 → 7 987 tok at HEAD, −23.6%; the same 12 files load before and after; the naming table's hidden constraints sit in `layering.md` and `kernel/CLAUDE.md`. |
| R15 | pass | This table records the four scenarios before and after (below); `git grep InstructionsLoaded` outside the tickets and `git log -S` on the branch find no committed hook. |
| R16 | pass | Skill body 2 202 → 1 679 tok at HEAD, −23.8% (S4's −34% predates S5–S6). `make worktree N=1` and the old block give identical `.env` files; each refusal leaves no `.env.new`, link or branch. A real one-step run was not observed. |
| R17 | fail | The gate is stated only in `sdd.md:41–47`, every other file points to it, and no later step asked again. A new session's first `/ticket-implement` step has not run since S5, so "asks once" is unobserved. |
| R18 | fail | The files say so, and no S8–S13 report broke it. But this run's R12–R16 verifier read `plan.md`, sent there by its brief; and S9's implementer ran `git checkout --` on two files to revert a probe. |
| R19 | fail | The split and the hunt condition are in the skill; no hunt ran on S8–S13. On S13 the Standards pass reported the lost "grep every suite" instruction under a rule its brief invented, and the Spec pass reported it too. |
| R20 | fail | No implementer ran `simplify`. The main session skipped it on S9, whose `make doc-limits` is code and which it gave a Depth review. |
| R21 | fail | The main session read files and diffs and wrote the fixes itself on S8–S13 instead of forwarding them; several findings lack a `path:line` or a fix (S10, S11, S12 Standards; S12 Spec). |
| R22 | pass | The three verifiers and both axes started at 12:49 in parallel; every verdict was in by 13:00, 11 min against run 2 of `modular-monolith`'s 33. |
| R23 | pass | The three templates and skills: a step pins its contract, traps and probe targets and leaves the rest to the implementer's grep; a design entry links its config; a check names the state it fails on; an acceptance row names no path. |

**Before and after (R15),** characters ÷ 4, at HEAD:

| Scenario | Before | After | Cut |
|---|---|---|---|
| R12 Spec reviewer's design reading | 1 044 tok | 621 tok | −40% |
| R13 implementer's rules and `CLAUDE.md` | 12 452 tok | 9 901 tok | −20.5% |
| R14 edit of a module's domain, then a service | 10 451 tok | 7 987 tok | −23.6% |
| R16 `/ticket-implement` body | 2 202 tok | 1 679 tok | −23.8% |

**Not verifiable:** R3 and R5 (their acceptance is the ledgers in `plan.md`); R2's `/doctor
prompt-audit` (a slash command, run by hand); R17's new-session check (no new session has run a
step since S5).

### Review

#### Standards

No hard finding in the `CLAUDE.md` files or the rules except one:

- `.claude/rules/claude-md.md:56`, commit `5ae787f02e` — `sdd.md › Gates` (a binding rule adds its
  record in `decisions.md`) — hard — the limits line and `make doc-limits` have no `decisions.md`
  record; only `rule-paths` has one.

Judgement calls:

- Commits `5ae787f02e` and `0f05ec9794` use `:rotating_light:` for Makefile gates (`:hammer:`);
  `3caabe80b7` and `ac5de77e37` use `:wrench:` for agent and skill text (`:memo:`).
- `.claude/rules/sdd.md:37,39` and `ticket-implement/SKILL.md:87` write `S11.1`; a placeholder
  `S<n>.1` would fit `claude-md.md › The pattern`.
- `.claude/rules/effect-style.md` sits at 80 of 80 lines.
- `Makefile` `DOC_LIMITS_LINE` and `DOC_LIMITS_READ` spell the limits line twice; `RULE_FILTERS`
  is a dense awk one-liner shared by two targets.
- `worktree.sh` leaves `.env.new` behind when `ln`, `git branch -m` or `bun install` fails.
- `architecture.md:9` and `decisions.md:13` cite dated ticket folders.

#### Spec

- `Makefile:144` — R7 — hard — `DOC_NAMES_IN` skips `docs/knowledge/roadmap.md`, as the design's
  Structure says, but R7 still asks for every Markdown file; `feature.md` needs the exclusion and
  its reason.
- `CLAUDE.md:14` — R2 — judgement — the dependency command is restated beside its pointer; keep
  the constraint and the pointer, or record the exception.
- `plan.md:511` — R15 — judgement — R13 was measured once at S8 with a margin of about 25 tok; the
  R12–R16 verifier recomputed it at HEAD (−20.5%).
- Not asked for: none. Gaps between groups: none; the commit gate, the implementer's reading, the
  agents' ownership, the parallel verifiers, R6, R11 and R23 each hold across the files.

### Simplifications

1. `Makefile` `DOC_LIMITS_READ`: print the expected line from the one sed pattern instead of a
   second spelling, one place to change when the limits line changes.
2. `.claude/skills/ticket-implement/worktree.sh`: `trap 'rm -f .env.new' EXIT`, so a failed `ln`,
   branch rename or install leaves nothing.
3. `.claude/rules/effect-style.md`: cut one line, so the next fix does not break `doc-limits`.

### Lessons

#### L1 — The main session wrote the fixes itself instead of forwarding them

- **Evidence:** S8, S9, S10, S11, S12 and S13: after each review the main session read the file
  (`cat`, `sed -n`, `git diff`) and edited it, and sent no fix round to the implementer (R21).
- **Cost:** the main session's context grew with every file it read; the fixes skipped the
  implementer's `make check` hook and its leftover grep, and R21 fails.
- **Proposed change:** the memory "fix findings myself up to 3 rounds" reads as "edit them
  myself"; reword it to "decide on the findings myself, without the user, and forward them to the
  implementer (`SendMessage`)", matching `/ticket-implement` step 5.
- **Applied:** yes, in the session's memory, on the user's OK (2026-11-03)

#### L2 — A brief added a focus of its own and crossed the axes

- **Evidence:** the S13 Standards brief asked whether an instruction "relies on something no file
  asks for", which no rule states, so Standards reported a Spec finding (R19); this run's R12–R16
  and R17–R23 briefs pointed to `plan.md`'s findings, and one verifier read it (R18).
- **Cost:** a finding reported twice, and a verifier reading what R18 keeps from it.
- **Proposed change:** `/ticket-implement` step 3 and `/ticket-verify` step 1: "a brief names its
  sources and nothing else: no question of its own, and no `plan.md` for a verifier".
- **Applied:** yes, in S15 (2026-11-03)

#### L3 — Agents broke `implementer.md`'s tool rules

- **Evidence:** S8's R13 replay read about 12 files through Bash despite "never `cat`, `sed`";
  S9's implementer ran `git checkout --` to revert a probe (R13, R18).
- **Cost:** a file read through Bash fires no rule filter, so R13's lever rests on the agent
  obeying one line; a checkout can drop uncommitted work.
- **Proposed change:** a `PreToolUse` hook on the implementer's Bash that refuses `cat`, `head`,
  `sed -n` on a tracked file and any `git checkout`, `git stash` or `git restore`.
- **Applied:** no: the hook landed in S15 and was removed on the user's word (2026-11-03)

#### L4 — A recorded result claimed more than the command showed

- **Evidence:** S12.2 wrote that `doc-names` fails "only on" › Where things live, which the
  probe's output did not show for line 126 (R1); S8's finding called the replay's Bash calls
  "`git rm` and a temp log" (R13).
- **Cost:** two requirements fail on the main session's own records, not on the work.
- **Proposed change:** `/ticket-implement` step 5: "a finding that states a check's result quotes
  the output it rests on".
- **Applied:** yes, in S15 (2026-11-03)

#### L5 — Which steps count as behaviour was decided case by case

- **Evidence:** S8, S10 and S11 were `opus high` docs steps and got no Depth and no `simplify`;
  S9, also `opus high`, adds Makefile code and got Depth but no `simplify` (R20).
- **Cost:** the skill's marker (`opus high`) and the memory "docs steps short review" disagree,
  so R20 fails on the main session's choice.
- **Proposed change:** `/ticket-implement` step 2: "a behaviour step is one that changes code
  (`.ts`, a `Makefile` recipe, a script); a docs-only step gets Standards and Spec alone".
- **Applied:** yes, in S15 (2026-11-03)

## 2026-11-03 — run 2

**Verdict:** fail

Run from the main session that implemented S14–S16, on the user's "ok", not in a new session.
The fixed point is `refactor/modular-monolith`, as in run 1. Four verifiers (R1 and R7–R11,
R2–R6 and R23, R12–R16, R17–R22) and the two review axes started together at 15:09 local time;
the last verdict came at 15:25. The probe verifier planted its probes in a scratch worktree, so
the axes' doc checks in the main tree stayed clean.

### Requirements

| Req | Result | Evidence |
|---|---|---|
| R1 | pass | Probe: `application/chat` moved to `application/conversation`, `chat.service.ts` renamed; `git grep -nE 'application/chat\|chat\.service\|#chat/\|chat/services\|chat/domain'` over every `CLAUDE.md`, rule, skill and agent exits 1. `make doc-names` fails only on `docs/knowledge/architecture.md:143-150` (› Where things live). |
| R2 | pass | Each fact has one owner; the root `CLAUDE.md` keeps the dependency command as the recorded exception. |
| R3 | not verifiable | Its acceptance is the ledgers in `plan.md`, which a verifier does not read. |
| R4 | pass | `git grep -nP '\b[0-9]+\.[0-9]+\.[0-9]+\b'` over `docs/knowledge` and every `README.md` hits only the roadmap's dated history. |
| R5 | not verifiable | As R3. |
| R6 | fail | Judgement: `.claude/rules/tooling.md:16-35` retells `docs/knowledge/tooling.md:207-305` instead of pointing to it. For keeping it: the rule loads by itself on `package.json` and `.env*`; the doc does not. The user's choice. |
| R7 | pass | Missing paths planted in a skill, an agent, `README.md` and `.github/PULL_REQUEST_TEMPLATE.md`, and a missing PascalCase name: `make doc-names` exits 1 with `.claude/agents/verifier.md:40: apps/nope/missing-probe.md`, `.claude/skills/ticket-verify/SKILL.md:45: ProbeMissingName`, `README.md:153: docs/knowledge/missing-probe.md`, `.github/PULL_REQUEST_TEMPLATE.md:67: apps/nope/x.md`. |
| R8 | pass | Source paths in a rule, a `CLAUDE.md`, a skill and an agent fail with `write the pattern` (`.claude/rules/naming.md:61: application/chat/domain/chat.model.ts`, `kernel/CLAUDE.md:22: kernel/package.json`); a placeholder, a package specifier, a `docs/knowledge` pointer, a glob and a path in `glossary.md` pass. |
| R9 | pass | `apps/nope-folder/**` in `layering.md` gives `.claude/rules/layering.md: apps/nope-folder/**`, exit 1; a one-line filter, a brace filter and a rule in a subfolder are flagged too. |
| R10 | pass | Green on the tree (`effect-style.md` at 80); probes give `.claude/rules/naming.md: 89 lines, over 80` and `kernel/CLAUDE.md: 45 lines, over 40`, exit 1; a changed limits line exits 2 and names the line it expects. |
| R11 | pass | `.claude/rules/claude-md.md`: the test :14-24, the owner :26-43, the pattern :45-52, the checks by their `make` targets :56-61. |
| R12 | pass | Spec reviewer's design reading −40.5%. |
| R13 | pass | 12 452 → 9 961 tok, −20.01%: a margin of one token's worth. The S16 implementer read a file with `sed -n` through Bash once. |
| R14 | pass | 10 451 → 8 027 tok, −23.2%. |
| R15 | fail | The table below records R16 under the 20% the requirement asks. |
| R16 | fail | Skill body 2 202 → 1 818 tok, −17.4%; it must be ≤ 1 761. S14 and S15 added about 139 tok after run 1's −23.8%. The worktree script's `.env` matches the old block's; each refusal leaves nothing. |
| R17 | not verifiable | Text: the gate is stated once, in `sdd.md:41-47`; every other hit points to it. Runtime: no new session has run `/ticket-implement` since the question was added; S14–S16 did not ask again. |
| R18 | pass | No run 2 verifier read `plan.md`; the S14–S16 Spec reports flag no `plan.md` edit; no implementer ran stash, checkout or commit; every report is English without a status block. |
| R19 | fail | S15: the hunt (`bash-guard.sh:107-108`) and Depth (`bash-guard.sh:108`) reported the same `git switch --discard-changes` bypass. S16: Standards reported `feature.md:128`, a long line, as "a style slip, not a binding rule". |
| R20 | fail | S16 changed 17 `.ts` files, a behaviour step by the skill's definition, and the main session ran neither `simplify` nor Depth, calling it "mechanical, like a rename". |
| R21 | fail | No source read before a fix round, and each round forwards `path:line`. But the S16 Standards finding lacks the rule field, and the four S15 `simplify` agents reported without `hard \| judgement`, as their brief asked. |
| R22 | pass | Six agents started between 15:09:11 and 15:09:23; the last verdict came about 16 minutes later, against run 2 of `modular-monolith`'s 33. |
| R23 | pass | The templates and skills pin contracts, traps and probe targets; an acceptance row names no path. |

**Before and after (R15),** characters ÷ 4, at HEAD:

| Scenario | Before | After | Cut |
|---|---|---|---|
| R12 Spec reviewer's design reading | — | — | −40.5% |
| R13 implementer's rules and `CLAUDE.md` | 12 452 tok | 9 961 tok | −20.01% |
| R14 edit of a module's domain, then a service | 10 451 tok | 8 027 tok | −23.2% |
| R16 `/ticket-implement` body | 2 202 tok | 1 818 tok | −17.4% |

**Not verifiable:** R3 and R5 (their acceptance is the ledgers in `plan.md`); R17's new-session
check (no new session has run a step since the question was added).

**Outside the requirements:**
- `sdd.md:37-40` asks for a round commit only before the user's recommendation lands;
  `ticket-implement/SKILL.md:91-94` asks for it before the main session's fixes too. Under the
  skill, the fix rounds of S14, S15 and S16 should have been committed first and were not.
- `doc-names` misses a stale path under a top-level folder that is gone (accepted in
  `decisions.md`), and R8 sees only backticked spans (D3).
- Two `doc-names` runs in one tree share `node_modules/.cache/doc-names/{known,spans}`: one run
  in three exited 2 with about 120 false hits while another agent ran the doc checks.

### Review

#### Standards

No hard finding. Judgement call:

- `deployment/CLAUDE.md:3-4` — "its other files are stubs until the deploy ticket lands" is
  bound to a future event; "the other files are stubs; an AWS stack is not deployable from them"
  stays true.

#### Spec

- `.claude/skills/ticket-implement/SKILL.md` — R16, R15 — hard — the body is at −17.4%; turning
  the Depth paragraph (:59-68) into a pointer to `docs/knowledge/sdd.md › What the wrappers
  override` saves the 226-233 characters it needs.
- R13 — judgement — passes by a hair (−20.01%), and its behaviour half rests on one line of
  `implementer.md`.
- `Makefile:169` — R7 — judgement — the `grep -E` inside `$(…)` in `doc-names` does not check
  for exit 2, so a broken pattern reads as "no hit".

### Simplifications

1. `.claude/skills/ticket-implement/SKILL.md:59-68`: the Depth paragraph becomes a pointer to
   `docs/knowledge/sdd.md`, where the same text lives; restores R16 and R15.
2. `.claude/skills/ticket-implement/SKILL.md:91-94`: the round commit points to `sdd.md › Gates`
   instead of restating it, so the two cannot disagree again.
3. `.claude/rules/effect-style.md:27`: drop "`.value` only under a narrowing guard", which the
   compiler enforces; gives R13 margin and the rule a free line.
4. `Makefile` `doc-names`: per-run temporary files instead of the shared cache, and a check of
   `grep`'s exit 2.
5. `deployment/CLAUDE.md:3-4`: the stub sentence without the future event.
6. `.claude/agents/implementer.md:52-54`: the Leftovers grep also covers `.claude/` and the
   `CLAUDE.md` files.

### Lessons

#### L6 — Later steps grew a measured file back over its threshold

- **Evidence:** R16 went from −23.8% in run 1 to −17.4% after S14 and S15 added to the skill;
  R13 fell from −20.5% to −20.01% after S14 and S16 touched the rules.
- **Cost:** a failed requirement, a fix step and a third run.
- **Proposed change:** in `/ticket-implement`, a step that edits a file a requirement measures
  re-measures it in its Verify.
- **Applied:** yes, in S17 (2026-11-03)

#### L7 — A code step was called mechanical and skipped `simplify` and Depth

- **Evidence:** S9 (run 1) and S16 (run 2), the second after L5 defined a behaviour step.
- **Cost:** R20 failed in both runs; S16's 22 converted functions had no design review.
- **Proposed change:** in `/ticket-implement` step 5, a step is ready only once the passes step 2
  and 3 name for it have run, and the commit body names them.
- **Applied:** yes, in S17 (2026-11-03)

#### L8 — Two passes reported one finding, or a pass reported outside its kind

- **Evidence:** S13 (run 1, Standards and Spec), S15 (the hunt and Depth), S16 (Standards on a
  non-binding style point).
- **Cost:** a duplicated fix in S15's round 3, a non-finding in S16's report.
- **Proposed change:** in `reviewer.md`, Depth leaves a correctness bug to the hunt, and Standards
  reports only a binding rule it can cite.
- **Applied:** yes, in S17 (2026-11-03)

#### L9 — The main session filled its window by reading whole ticket files

- **Evidence:** fresh sessions start at about 57 000 tok and reached 100 000 within 8 to 26 turns
  (2026-10-31 to 2026-11-03), mostly whole reads of `plan.md` (11 500 tok on `modular-monolith`),
  `architecture.md` and `feature.md`, and `cat` loops over several files; `plan.md` grows with
  every step's findings.
- **Cost:** earlier compactions (four in this session) and summaries that drop detail.
- **Proposed change:** in `/ticket-implement` step 1, read only the plan's **Status** table and the
  step's own section. Accepted by the user on 2026-11-03.
- **Applied:** yes, in S17 (2026-11-03)

## 2026-11-03 — run 3

**Verdict:** fail

Run in a new session after S17–S20. The fixed point is `refactor/modular-monolith` (89fdbcf073),
as in runs 1 and 2, not `origin/main`, which would review that ticket's commits too. Four
verifiers (R1, R7–R11 and R24; R2–R6 and R23; R12–R16; R17–R22) and the two review axes started
together at 18:56 local time; the last verdict came at 19:05. The probe verifier planted its
probes in a scratch worktree and removed it.

### Requirements

| Req | Result | Evidence |
|---|---|---|
| R1 | pass | Probe: `application/chat` moved to `application/talk`, `message.service.ts` renamed; `git grep` of the old names over every `CLAUDE.md`, rule, skill and agent exits 1. `make doc-lint` fails only on `docs/knowledge/architecture.md:143-150` (› Where things live). |
| R2 | fail | The nine facts of the Context each have one owner and pointers elsewhere. Three breaks: `decisions.md:664` restates the size limits it says live only in `claude-md.md:56`; `decisions.md:634-635` says no rule refuses a ticket id in the docs, while `claude-md.md:41-42` refuses "ticket numbers"; `sdd.md:35` "One plan step = one commit" against `sdd.md:37-40` (one commit per round), and the first is repeated in `pull-requests.md:14`, `_template/plan.md:16`, `docs/knowledge/sdd.md:43,68`, `ticket-plan/SKILL.md:14`. `/doctor prompt-audit` not run (interactive); a script resolved all 211 anchored links and every "file › section" pointer. |
| R3 | not verifiable | Its acceptance is the ledgers in `plan.md`, which a verifier does not read. |
| R4 | pass | `git grep -nP '\b[0-9]+\.[0-9]+\.[0-9]+\b'` over the docs outside the tickets and the roadmap finds nothing; "today" and count hits sit in their owner. |
| R5 | not verifiable | As R3; the traps sit in the files where they bite (`effect.md:8`, `effect-tests.md:37-39`, `application/CLAUDE.md:11-15`, `http-api/CLAUDE.md:16-19`, …). |
| R6 | pass | `deployment/local/README.md` is gone and nothing refers to it; none of the 44 docs only retells. |
| R7 | pass | Missing paths in a skill, an agent, `README.md`, the PR template and a new `packages/probe/README.md` fail with `<file>:<line> error missing-path`; the roadmap and `_template/` are skipped. |
| R8 | pass | Source paths in a rule, a `CLAUDE.md`, a skill and an agent fail with `source-path`; a placeholder, a package specifier, a doc pointer and a glob pass. |
| R9 | pass | `no-such-folder/**/*.ts` in `effect-services.md` gives `.claude/rules/effect-services.md:3 error unmatched-filter`; a brace filter is caught too. |
| R10 | pass | Green on the tree; 92 lines in `layering.md` and 46 in `application/CLAUDE.md` fail with the length; 80 passes, 81 fails; a changed limits line exits 2. |
| R11 | pass | `claude-md.md`: the test :14, the owner :26, the pattern :45, the limits and `make doc-lint` :54-61. |
| R12 | fail | Cut −40.5% (1 044 → 621 tok); no reviewer read the design whole. But in 3 of 5 Standards briefs of S17–S20 the main session listed rules outside `make review-rules`: S17.2 `deep-modules.md`, S19.1 `effect-style.md › Signatures` on a diff with no `.ts`, S20.2 `naming.md` and `tooling.md` carried over from S20.1. |
| R13 | fail | Load 12 452 → 9 910 tok, −20.4%, over the 13 rules of the baseline `dcd042ccb7` (with the three `CLAUDE.md` files: −19.1%). The S18, S19 and S20 implementers read and edited through Bash: `sed -i ''` on `biome.json`, `tooling.md`, `decisions.md`, `architecture.md`; `python3` heredocs rewriting the `Makefile` and `.misc/lint/biome.json`; `cat`/`sed -n` reads. |
| R14 | pass | 10 451 → 7 985 tok, −23.6%; an `InstructionsLoaded` replay at HEAD loads the same 12 files as the baseline, the services file nothing more. Ledger half not verifiable. |
| R15 | pass | The table below; no measuring hook committed (`git grep InstructionsLoaded` outside the tickets exits 1). |
| R16 | pass | Skill body 2 202 → 1 680 tok, −23.7%; the S17 and S20 runs loaded no parallel-steps text; `make worktree N=2` and the old block write identical `.env` files; each refusal leaves nothing. |
| R17 | pass | Text: stated once in `sdd.md:41-47`, pointers elsewhere. Runtime: session `a415a68c` asked once at its first `/ticket-implement` (13:44Z), committed S18–S20 without asking again, also after a compaction. |
| R18 | pass | The agents' files say so; no verifier of runs 2 and 3 read `plan.md`; no Spec report flags a `plan.md` edit; no implementer report carries the status block. |
| R19 | fail | The hunt ran only on S17–S19, inside its condition, and not on S20. But Standards and Depth reported the same finding on S17.1 (`DOC_NAMES_FAILED` ordering), S17.2 (`sdd.md:40-44`) and S19 (two filter readers): the Standards brief still carries code-review's smell baseline, which the override table of `ticket-implement/SKILL.md:40-45` does not remove. |
| R20 | pass | The main session ran `simplify` before review on S14, S15, S17, S18, S19 and skipped S20, a config move; no implementer transcript holds a `Skill` call. |
| R21 | fail | Fix rounds forward `path:line` without reading code (one `git diff` before S18.3 served the commit message). About 20 of 55 finding bullets of S17–S20 miss a field: no line (S17 Standards "`Makefile` (the `DOC_NAMES_FAILED` hunk)"), no `hard \| judgement` (S18 Standards), no `path:line` lead (S19 Spec). |
| R22 | pass | Run 3's six agents started within 20 s; verdicts in about 9 min, against 33 min for `modular-monolith` run 2. |
| R23 | pass | The templates and the three skills ask for property and check, decision and invariant with a linked config, outcome, constraints and a failing-state check; L8's probe per guard is in `ticket-plan`. |
| R24 | pass | Probes run against the base commit's Makefile and the new rules: the old `service-use`, `nested-calls`, `idioms` and the Biome plugin hit the same lines; `doc-width` and MD013, `doc-names` and `missing-path` the same lines; the clean tree passes both; `make help` lists no replaced target; CI runs `make lint BIOME=ci` and `make doc-lint`. |

**Before and after (R15),** characters ÷ 4, at HEAD `8e7650ae5c`:

| Scenario | Before | After | Cut |
|---|---|---|---|
| R12 Spec reviewer's design reading | 1 044 tok | 621 tok | −40.5% |
| R13 implementer's 13 rules | 12 452 tok | 9 910 tok | −20.4% |
| R14 edit of a module's domain, then a service | 10 451 tok | 7 985 tok | −23.6% |
| R16 `/ticket-implement` body | 2 202 tok | 1 680 tok | −23.7% |

Run 2 labelled R13's row "rules and `CLAUDE.md`"; the baseline commit measures the 13 rules only.

**Not verifiable:** R3 and R5 (ledgers in `plan.md`); R14's ledger half; `/doctor prompt-audit`
(interactive); R17 rests on one new session.

**Outside the requirements:**
- `make check` is green: 221 unit and 104 e2e tests.
- The implementer undid its probes with `git checkout -- <file>` on S8, S9 and S17, which
  `implementer.md:36` forbids by name.
- The main session told the S17.3, S18.2, S18.3 and S19.2 implementers to write `plan.md`, which
  `implementer.md:34-37` reserves for the main session; they did.
- S16 changed four `*.test-fake.ts` files and ran no hunt; run 2 missed it.

### Review

#### Standards

No hard finding; `make doc-lint` exits 0; every commit follows `commits.md`. Judgement calls:

- `.claude/rules/tooling.md:11` — `claude-md.md › The owner` — judgement — restates "pinned
  exactly, `catalog:<namespace>`" that root `CLAUDE.md:16-17` also carries (the R2 exception);
  the browser-safety line repeats in `application/CLAUDE.md:11`, `http-api/CLAUDE.md:6`,
  `packages/CLAUDE.md:7`. Keep if each scope stands alone, else one owner and links.
- `.claude/rules/effect-style.md:80`, `.claude/rules/effect-tests.md:75` — `claude-md.md › The
  pattern` — judgement — `tooling.md › Tests` and `› Environment` are bare backticks that the
  rule `tooling.md` lacks, and `make doc-lint` skips a span with ` › `; make them links to
  `docs/knowledge/tooling.md#…`.
- `packages/CLAUDE.md:9` — consistency — judgement — the `tooling.md › Add a package` pointer
  becomes a link like the other `CLAUDE.md` files'.

No baseline smell in the code hunks; the TypeScript changes are arrow-to-declaration conversions.

#### Spec

- `.claude/skills/ticket-implement/SKILL.md:26-35` — R20 — judgement — "a step that changes code
  (a `.ts` file …)" and "never on a move, rename or config step" both fit a rename that edits
  `.ts`, the S16 case; one deciding test: a diff that changes a `.ts` file's content, a recipe or
  a script.
- `.claude/settings.json:84-87` — R18 — judgement — `git stash*`, `git checkout*`, `git commit*`
  are allowed since the guard went (7b4e4ffe45); the rule rests on `implementer.md` alone, and
  R18's acceptance should say so.
- `.claude/settings.json:5-121` — scope — judgement — 19ff237b04 and 73d486ccaf widen the allow
  list, turn five plugins off and deny three MCP servers; `feature.md › Scope` names none of it.
- `feature.md:119-122` — scope — judgement — the move of the lint configuration to `.misc/lint/`
  (D17, S20) is in `architecture.md` only; extend the Scope bullet.
- `.claude/settings.json` `Bash(gh *)` — R17 — judgement — `ask` catches `gh pr create` and
  `gh pr merge` but not `gh api -X PUT …/pulls/<n>/merge` or `…/git/refs`; add `Bash(gh api*)` to
  `ask` or narrow the allow to read-only subcommands.
- `.misc/lint/markdownlint-cli2.mjs:88` — R8 — judgement — the code passes any `@<scope>/`, while
  `architecture.md › Contracts` says "no `@app-template/` prefix"; the contract text follows the
  code.
- `.claude/agents/verifier.md:21`, `.claude/skills/ticket-verify/SKILL.md:22` — Context — judgement
  — both diff from `git merge-base HEAD origin/main`, so on a branch whose PR targets another
  branch they review that branch's commits too; "the merge-base with the PR's base branch".

### Simplifications

1. `sdd.md:35-40`: one statement of how a step commits (rounds), and `pull-requests.md:14`,
   `_template/plan.md:16`, `docs/knowledge/sdd.md:43,68`, `ticket-plan/SKILL.md:14` point to it;
   `decisions.md:664` without the numbers; `claude-md.md:41-42` or `decisions.md:634-635` brought
   into agreement on ticket ids. Restores R2.
2. `ticket-implement/SKILL.md:40-52`: the override table drops code-review's smell baseline from
   the Standards axis, and its rule list is the output of `make review-rules`, nothing added.
   Restores R19 and R12.
3. `reviewer.md:40-45`: the finding shape as one literal template line, and a finding without a
   line is not reported. Restores R21.
4. `implementer.md:44-45` and the brief: edits and reads only through the file tools; the
   bypass-mode harness text invites the shell, so the line alone did not hold (R13).
5. `ticket-verify/SKILL.md:22`, `verifier.md:21`: the fixed point is the merge-base with the PR's
   base branch.
6. `.claude/settings.json`: `Bash(gh api*)` into `ask`; `feature.md › Scope` names the settings
   and the `.misc/lint/` move.
7. `effect-style.md:80`, `effect-tests.md:75`, `packages/CLAUDE.md:9`: bare `› ` pointers become
   links; `architecture.md › Contracts` says "no package specifier".
8. `ticket-implement/SKILL.md:26-35`: one deciding test for a behaviour step.

### Lessons

#### L10 — The implementer read and edited through the shell

- **Evidence:** S16 (run 2, `sed -n`), S18, S19 and S20 (`sed -i ''`, `python3` heredocs, `cat`);
  `git checkout -- <file>` to undo probes on S8, S9 and S17.
- **Cost:** R13 failed; a path-scoped rule loads only on a file-tool access, so the shell edits
  ran without the rules R13 counts on arriving.
- **Proposed change:** a mechanical check: a `PreToolUse` hook in `implementer.md`'s front matter
  refusing `cat`, `sed -n`, `sed -i`, a heredoc into a file and `git checkout --`, since the line
  in `implementer.md` did not hold against the bypass-mode harness text.
- **Applied:** yes, in S22 (2026-11-03)

#### L11 — The main session's briefs broke the skill they ran

- **Evidence:** Standards briefs with rules beyond `make review-rules` (S17.2, S19.1, S20.2);
  implementers told to write `plan.md` (S17.3, S18.2, S18.3, S19.2).
- **Cost:** R12 failed; `implementer.md` and the briefs contradict each other.
- **Proposed change:** in `/ticket-implement`, the Standards brief pastes `make review-rules`'s
  output verbatim; `implementer.md` lets the implementer write the `plan.md` edits the main
  session dictates at the last round, so the main session keeps off the files (R21).
- **Applied:** in part, in S22: the brief pastes `make review-rules` verbatim; the implementer
  writing `plan.md` was dropped on the user's choice

#### L12 — Standards and Depth reported the same shape finding

- **Evidence:** S13 and S15 (runs 1 and 2), S17.1, S17.2, S19 (run 3); L8 put the line in
  `reviewer.md`, but the Standards brief still carries the smell baseline.
- **Cost:** R19 failed three runs in a row; duplicated fixes in the rounds.
- **Proposed change:** in `/ticket-implement`'s override table, "Standards: no smell baseline;
  Depth owns the shape".
- **Applied:** yes, in S22 (2026-11-03)

#### L13 — Findings off the four-field shape

- **Evidence:** S15 and S16 (run 2), about 20 of 55 bullets of S17–S20 (run 3).
- **Cost:** R21 failed twice; the main session had to locate a line itself.
- **Proposed change:** in `reviewer.md`, the shape as a literal line
  `` `path:line` — <rule or R…> — hard | judgement — <fix> ``, and "a finding without a line is
  not reported".
- **Applied:** yes, in S22 (2026-11-03)

#### L14 — A changed statement left its old copies standing

- **Evidence:** the rounds (6766d051fe, 808020c2cf) left "one plan step = one commit" in five
  files; D16 (ticket ids) left `claude-md.md:41-42`; the limits copied into `decisions.md:664`.
- **Cost:** R2 failed after passing runs 1 and 2.
- **Proposed change:** in `implementer.md › Leftovers`, a step that changes a rule or a decision
  greps the old statement's key phrase over `.claude/`, the `CLAUDE.md` files and
  `docs/knowledge/`, not only the renamed names.
- **Applied:** yes, in S22 (2026-11-03)
