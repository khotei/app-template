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
- **Applied:** no; planned as S15 on the user's OK

#### L3 — Agents broke `implementer.md`'s tool rules

- **Evidence:** S8's R13 replay read about 12 files through Bash despite "never `cat`, `sed`";
  S9's implementer ran `git checkout --` to revert a probe (R13, R18).
- **Cost:** a file read through Bash fires no rule filter, so R13's lever rests on the agent
  obeying one line; a checkout can drop uncommitted work.
- **Proposed change:** a `PreToolUse` hook on the implementer's Bash that refuses `cat`, `head`,
  `sed -n` on a tracked file and any `git checkout`, `git stash` or `git restore`.
- **Applied:** no; planned as S15 on the user's OK

#### L4 — A recorded result claimed more than the command showed

- **Evidence:** S12.2 wrote that `doc-names` fails "only on" › Where things live, which the
  probe's output did not show for line 126 (R1); S8's finding called the replay's Bash calls
  "`git rm` and a temp log" (R13).
- **Cost:** two requirements fail on the main session's own records, not on the work.
- **Proposed change:** `/ticket-implement` step 5: "a finding that states a check's result quotes
  the output it rests on".
- **Applied:** no; planned as S15 on the user's OK

#### L5 — Which steps count as behaviour was decided case by case

- **Evidence:** S8, S10 and S11 were `opus high` docs steps and got no Depth and no `simplify`;
  S9, also `opus high`, adds Makefile code and got Depth but no `simplify` (R20).
- **Cost:** the skill's marker (`opus high`) and the memory "docs steps short review" disagree,
  so R20 fails on the main session's choice.
- **Proposed change:** `/ticket-implement` step 2: "a behaviour step is one that changes code
  (`.ts`, a `Makefile` recipe, a script); a docs-only step gets Standards and Spec alone".
- **Applied:** no; planned as S15 on the user's OK
