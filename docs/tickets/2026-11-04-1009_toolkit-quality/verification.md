# Toolkit quality — verification

> Ticket: `2026-11-04-1009_toolkit-quality` · Requirements: [feature.md](./feature.md) · Plan: [plan.md](./plan.md)

<!-- /ticket-verify appends one dated section per run; earlier runs stay as history. -->

## 2026-11-04 — run 1

**Verdict:** fail

Branch `chore/toolkit-quality` at `31160f725e`, against the merge-base `aaf033494f` with `main`.
Five verifiers, one per `###` section of the requirements; `make check` green (exit 0: doc-lint,
Biome on 255 files, `tsc -b`, 221 unit tests, 104 e2e tests, the web bundle).

**Accepted by the user:** R1, R8 and R4 fixed as the Spec findings propose, S10.1 re-run on opus
with R4's re-run; the seven out-of-scope commits moved to their own branch and PR; the five
simplifications as one step; L1–L3 applied. They land as `plan.md` S7–S11.

### Requirements

| Req | Result | Evidence |
|---|---|---|
| R1 | fail | Four lenses, no import-direction candidate in the three Design reports (`replay.md:97-165`). A real move fails the acceptance: a verifier's `git mv packages/aws/naming.ts packages/aws/names.ts` with both importers rewritten to `#aws/names`, run as `/ticket-implement`'s main session, answered "Design — run … Шаг считается behaviour step по тому же тесту". Cause: `.claude/skills/ticket-implement/SKILL.md:27-29`, a behaviour step is any diff that changes a `.ts` file's content, and a move always rewrites its importers' lines; "a pure move included" covers only a rename with untouched importers |
| R2 | pass | The reviewers' reports in the replay transcripts: 3 candidates (S2.1), 4 (S10.1), 3 then 2 (S11.1), each with a `before` and an `after` block and a strength |
| R3 | pass | `design-examples.md` is linked only from the Design brief (`.claude/skills/ticket-implement/SKILL.md:61`); every example is on `Order` (`design-examples.md:3`); no code line of 25 characters or more appears verbatim in `.claude/rules` or `docs/knowledge`; all 8 links resolve. Caveat: at effort `low`, 2 of 4 Design reports were written without opening the file (`replay.md:477-478`) |
| R4 | fail | The question is in place (`.claude/agents/reviewer.md:56-58`). S30.2's hunt names its construct (`Makefile:151`, `\| grep .` tests only grep's exit, shown `exit=0`). S8.1's does not: the round adds `Effect.asVoid(chats.update(…))` to `chat.service.ts`, and the report ends "I found no silent fallback in `ChatRepositoryPg.update`" (`replay.md:44`, `:201-203`). A discarded result is not among the construct kinds the hunt is told to question |
| R5 | pass | All six behaviour findings of the two hunts state an input and a wrong outcome; the planted finding with no scenario was dropped. Caveat: the four S8.1 `path:line` values were positions in `git diff` output (`send-message.use-case.ts:775`, a file of 87 lines); the user saw the researchers' corrected lines, which a `shown` finding never gets |
| R6 | pass, in part | S8.1: five `researcher` calls on opus in one message, before the presentation: four `confirmed`, the planted one `refuted` by `bunx vitest run … -t "updateTitle"` → `Tests 4 passed`. S30.2: one `confirmed`, then asked with two options. The `unclear` branch was never observed (below) |
| R7 | pass | The Red list (`.claude/skills/ticket-plan/SKILL.md:48-50`, fixes required at `:60-61`). The replay on five `modular-monolith` steps found two `cannot run` and one `passes` (`replay.md:265-332`); a verifier re-ran S26's stdin Biome (no diagnostic) and S37's `DOC_NAMES_IN` at `6fe0b488c4^` (no `docs/tickets/`). Gap against the goal, not R7's words: four of L4's five defects came back `fails as expected` though they could never pass after their step |
| R8 | fail | R8 asks for "one probe per ban the guard enforces today"; the skill counts "a ban being one scope of the guard (a Biome override, a grep's pattern)" (`.claude/skills/ticket-plan/SKILL.md:32-33`). At `8572da12bf`, `biome.json` holds 176 restriction groups across 48 overrides (`jq '[.overrides[] \| .linter.rules.style.noRestrictedImports.options // empty \| ((.patterns // []) \| length) + ((.paths // {}) \| length)] \| add'` → `176`); the replay planted 50 probes. Example: `apps/api/**` holds four bans with their own messages, P41 plants one. A rewrite that drops one group and keeps its override passes every probe. The rest holds: probes fail before S39, 37 no longer fail after (a verifier re-ran P41, P42, P47, P49, P9 by `git archive` at both commits) |
| R9 | pass | `.claude/skills/ticket-implement/SKILL.md:43` names `mattpocock-skills:writing-for-agents` for an instruction-file diff; `.claude/agents/reviewer.md:26-29` loads it and lets `claude-md.md` win; the no-op experiment at `SKILL.md:71-73` and `researcher.md:26-31`; `grep -c writing-for-agents .claude/agents/implementer.md` → `0` |
| R10 | pass | `.claude/skills/ticket-feature/SKILL.md:33-39`, step 2, calls `diagnosing-bugs` phases 1 and 2 before the grilling (step 3) and the requirements (step 4), copies the command and its failing output into `feature.md › Reproduction`, and makes it the acceptance check (`:47-48`); `docs/tickets/_template/feature.md:27-38` holds `## Reproduction` above `## Requirements` |
| R11 | pass | `replay.md:14-26`: Design on three steps, the hunt on two, the plan-time run on five, the probes on one, each with findings and wall time; effort `low` at `replay.md:7`, `:69`. S10.1's Design reviewer ran on fable, which R11 does not exclude; the summary counts the four opus runs |
| R12 | pass | `docs/tickets/_template/verification.md:21-27` holds the ledger; `.claude/skills/ticket-verify/SKILL.md:31-36` sums it; `docs/tickets/_template/plan.md` and `.claude/skills/ticket-implement/SKILL.md:88-90` record each finding's pass and fate; this run fills the ledger below |

**Not verifiable:**

- R6's `unclear` branch: no replay produced one. A verifier planted a `claimed` finding at
  `packages/s3/bucket.ts:242` and ran step 4 through `claude -p` (169 s); the researcher answered
  `refuted` by a `curl` to MiniStack.
- R9 and R10 in use: no instruction-editing step has been reviewed under the new brief, and no
  bug ticket has started. The no-op experiment was not run, since each run waits for the user's
  approval.
- R5's missing-test finding: the replay ran no Spec pass, so no such finding was seen.
- R11's wall times rest on the replay sessions' transcripts, outside the tree; the method is
  recorded, each number is not re-measured.
- Whether the Design pass reads the examples at the default effort `medium`: the replay ran at
  `low` only.

### Review

#### Review ledger

Summed from each step's **Findings** in `plan.md`; S1 and S2 had none.

| Pass | Findings | Accepted | Fixed | Rejected |
|---|---|---|---|---|
| Standards | 3 | 2 | 2 | 1 |
| Spec | 8 | 7 | 7 | 1 |
| Replay (S6, not a review pass) | 2 | 2 | 0 | 0 |

#### Standards

Hard violations: none. Commit subjects, gitmoji and scopes follow `commits.md`; `design-examples.md`
uses the neutral `Order` and its anchors exist.

Judgement calls (rule breaches):

- `.claude/CLAUDE.md:19-20` — `claude-md.md` § The owner — "Effect is v4 and Drizzle a release
  candidate … Check an API against `repos/effect`" restates `.claude/rules/effect.md:8-11`; cut to
  the pointer, or drop it, since the rule loads on any `.ts` file.
- `.claude/CLAUDE.md:24-26` — `claude-md.md` § The owner and The test — "Substance is new
  behaviour, a new dependency or a choice a reviewer could question; a typo, a version bump or a
  doc fix is one commit…" copies `docs/knowledge/sdd.md` › When to run which cycle, which the next
  line links; drop the sentence.
- `.claude/CLAUDE.md:11-12` — `claude-md.md` § The test, point 1 — "A layer's `CLAUDE.md` and the
  rules in `.claude/rules/` load on their own once a matching file is touched" narrates the
  harness; `writing-for-agents` § Pruning says the same. Cut it, or run the no-op experiment.
- `.claude/skills/ticket-implement/design-examples.md:23-60`, `:76-80` — `claude-md.md` § The
  owner — the "Don't" paragraphs restate rule content in prose ("a body that only delegates is
  passed as is", "No port in front of a repository") beside their link; keep the snippet and the
  `Rests on:` link.

Instruction-file notes (`writing-for-agents`):

- `.claude/skills/ticket-implement/SKILL.md:~95-105` — Information hierarchy, Sprawl — step 4
  holds the confirmation protocol, the no-op dispute rule and the filter list inline; the
  confirmation block is a branch (only `claimed` findings) and fits behind a pointer to a sibling
  file. The wrap "Present the implementer's / report and what simplify changed" left an orphan
  line.
- `docs/knowledge/sdd.md`, When to run which cycle, row 2 — "with a few requirements, a bug's
  starting from one command that shows it failing, then…" is ungrammatical; reword to "…with a
  few requirements (a bug starts from one command that shows it failing), then…".

Smell baseline:

- Duplicated Code (judgement): the researcher brief in `ticket-plan/SKILL.md` and the bullets of
  `researcher.md` both describe the worktree-probe procedure; keep one owner, link it from the
  other.

#### Spec

Implemented but looks wrong:

- `.claude/skills/ticket-plan/SKILL.md:32` — R8 ("one probe per ban the guard enforces today") —
  a ban is defined as one Biome override, so the other bans of an override are never planted;
  the S39 replay planted 50 probes for 176 ban groups, and four of L8's lost bans had no probe of
  their own (`replay.md:339`, `:500`) — define a ban as one refused import or pattern.
- `plan.md:438` — R1 / D1 ("a move-only step gets no design pass") — a real move rewrites its
  importers' `.ts` lines, so the behaviour-step test gives it a Design pass; recorded in S6 as
  "accepted, open" — state in `ticket-implement` that a move is no behaviour step, or narrow R1's
  acceptance.

Missing or partial:

- `replay.md:17` — R11 ("the design pass on three behaviour steps … with the reviewer at low
  effort") — hard — S10.1's reviewer ran on fable and the summary leaves it out (`:509`), so two
  of three Design replays meet the intent; re-run S10.1 on opus at `low`, or record the shortfall
  in `feature.md`.
- `replay.md:44` — R4 ("the hunt's report on a replayed step with a swallowed error names that
  construct") — judgement — S30.2 names its construct, S8.1 reports "no silent fallback" over
  `Effect.asVoid`; record R4 as partial.

Not asked for:

- `README.md:1` — Scope — judgement — seven commits outside the ticket sit on the branch and would
  squash into its PR: `a007a2c00d`, `f7e911132a`, `d2a27aa7e4`, `0c25b6f416`, `378afe0717`,
  `1591ba43ab`, `31160f725e` (`.mcp.json`, `.claude/settings.json`, `CLAUDE.md` moved into
  `.claude/`, `README.md`, `Makefile`, `.markdownlint-cli2.mjs`, `docs/knowledge/tooling.md`, the
  MCP paragraph of `sdd.md`); move them to their own PR, or name them in the PR body.

Checked, no finding: R2, R3, R5, R6, R7, R9, R10, R12.

### Simplifications

1. Cut the three restating lines of `.claude/CLAUDE.md` (`:11-12`, `:19-20`, `:24-26`), each
   owned by a rule or `sdd.md`; about 7 lines less in a file loaded by every session.
2. Reduce each "Don't" of `design-examples.md` (`:23-60`, `:76-80`) to its snippet and its
   `Rests on:` link; the prose that restates the rule cannot go stale.
3. Move step 4's confirmation protocol of `.claude/skills/ticket-implement/SKILL.md` (`~:95-105`)
   to a sibling file behind one pointer, read only when a `claimed` finding exists; fix the orphan
   line.
4. Keep the worktree-probe procedure in `researcher.md` alone and link it from
   `ticket-plan/SKILL.md`'s brief.
5. Reword `docs/knowledge/sdd.md`'s bug row of *When to run which cycle*.

### Lessons

No user feedback in this session.

#### L1 — Replay summaries counted more than the runs showed

- **Evidence:** S5, three Spec findings (an `unclear` path claimed though never seen; reviewer
  lines called right though they were diff positions; the fable run counted with the opus ones);
  S6, three Spec findings (probes counted as bans; S26, S27, S36 read as L4 hits though their
  verdict was `fails as expected`; the per-ban ask read as met).
- **Cost:** a fix round in each step (S5.2, S6.2); 6 of the ticket's 8 Spec findings.
- **Proposed change:** `.claude/agents/implementer.md`, one line: a count or claim in a report
  uses the requirement's unit and counts only the runs that meet its conditions; a near hit, a
  side note or a run off those conditions is stated apart.
- **Applied:** yes, S11

#### L2 — Reviewers cite lines from `git diff` output, not from the file

- **Evidence:** S5's replay, four of four opus reviewers at `low` read code through `git diff` or
  `cat`; S8.1's four lines and S11.1's lines past the file's end, S30.2's one off; this run's R5
  caveat.
- **Cost:** every S8.1 line was wrong in the report; only the confirmations corrected them, and a
  `shown` finding gets none.
- **Proposed change:** `.claude/agents/reviewer.md`, the finding line: its `path:line` is read
  from the file at `HEAD` with `Read`, never from a diff hunk's position.
- **Applied:** yes, S11

#### L3 — A replay finding that fails this ticket's requirement was deferred, not fixed

- **Evidence:** S6 marked the move-only gap (R1) and the ban unit (R8) "accepted, open … left to
  the next ticket"; both fail here, as R1 and R8. The same S6 entry defers two more (below).
- **Cost:** two failed requirements and a fix step each after verification, where a fix in S6.2
  would have cost one round.
- **Proposed change:** `.claude/skills/ticket-implement/SKILL.md`, step 4: a finding that fails
  one of this ticket's requirements is fixed in the step's next round; only one outside them may
  stay `accepted, open`.
- **Applied:** yes, S11

#### Carried from `plan.md` › S6 (left to verification there)

- The Red list has no verdict for a check that fails today and can never pass after its step, the
  kind of three of L4's five defects. Proposed: `ticket-plan`'s Red list adds `cannot pass`,
  judged against the step's change; its own ticket, since it changes R7's verdict set.
- S22's Standards and Spec briefs carry `code-review`'s own asks against "names its sources and
  nothing else". Proposed: `ticket-implement` step 3 says the rule covers the main session's
  additions, and `code-review`'s axis asks pass unchanged.

## 2026-11-04 — run 2

**Verdict:** fail

Branch `chore/toolkit-quality` at `5dc07c1bc1`, against the merge-base `aaf033494f` with `main`,
after S7–S12. Six verifiers, one per `###` section of the requirements; the R13 verifier ran
`make check` (exit 0: 104 e2e tests, the web bundle). The R4–R6 and R7–R8 verifiers re-ran their
replays under the current toolkit in disposable worktrees, removed afterwards.

**Accepted by the user:** R8's probes on every scope of S39; one more attempt at R6's `unclear`
branch; the three simplifications as one step; L1–L4 applied, L4 as a hook; the S37 record of
`replay.md` corrected. They land as `plan.md` S13–S17.

### Requirements

| Req | Result | Evidence |
|---|---|---|
| R1 | pass | No Depth axis left (`git grep -i -E '\bdepth\b\|module.shape'` over `.claude`, `docs/knowledge`, `README.md`: no hit); Design on a behaviour step only (`.claude/skills/ticket-implement/SKILL.md:62`), a move gets Standards and Spec (`:30-32`); 13 candidates in the four Design transcripts, none on import direction. Caveat: the move case of the current wording (importers' lines rewritten) was never replayed |
| R2 | pass | Candidates per run 3, 4, 3 then 2, and 4 (the opus rerun); two code blocks under each heading, each ending in `Strong`, `Worth exploring` or `Speculative` |
| R3 | pass | `design-examples.md` linked only from `SKILL.md:64`; every example on `Order`; none of its 53 code lines of 20+ characters appears in the 31 rule, `CLAUDE.md` and `docs/knowledge` files (a planted copy from `deep-modules.md:31` was found); 8 links resolve. Caveat: at effort `low`, 3 of 5 Design reports were written without opening the file |
| R4 | pass | `.claude/agents/reviewer.md:55-58` names a discarded result. Re-run on S8.1 under the current toolkit: the report names `touch`'s `Effect.asVoid(chats.update(…))` and says it hides "a chat deleted mid-send" that the FK "turns into a defect", the failure `f6e2561120` fixed, yet judges it sound and raises no finding. S30.2: `Makefile:149`, a missing perl lets the gate pass (`perl … /nonexist.ts` exit 0, piped into `grep .` → 1). Caveat: on S8.1 one correct run of three (S5 missed the construct, S9 misjudged its failure) |
| R5 | pass | All 4 reviewer findings of the two re-runs give an input and a wrong outcome; a planted finding with no scenario was dropped ("у находки нет сценария"). Defect: both S8.1 lines land on blank lines (`send-message.use-case.ts:64`, code at `:62-63`; `chat-title.job.ts:24`, code at `:25-27`); the reviewer read through `cat -n` and `git diff`, not `Read` (`reviewer.md:20-21`, `:64-65`) |
| R6 | pass, in part | S8.1 re-run: four `claimed` findings to four opus researchers in one message before the presentation; two `confirmed`, two planted ones `refuted` by trace and listed as rejected. S30.2: two `confirmed`, asked with options. The `unclear` branch was never observed (below) |
| R7 | pass | Red list at `.claude/skills/ticket-plan/SKILL.md:58-60`, fixes at `:70-72`. A verifier re-ran S37's plan at its parent `17c552af21` through `claude -p`: `make check` `cannot run` (no `node_modules`, TS2307), `make doc-width` and `make doc-names` `passes` (both exit 0 by hand), each fixed in the plan. Record error: `replay.md:392-394` has S37's `doc-width` as `fails as expected`, a failure from `design-examples.md` copied into that tree, so "one `passes`" at `:607-609` undercounts |
| R8 | fail | The skill holds R8 (`SKILL.md:32-44`, `:61-69`) and the mechanism works: a verifier set up `toolkit-quality-plan-probes` (`make worktree N=7`, 5.95 s), planted one probe per ban of `application/*/services/**` (`.misc/lint/biome.base.json:171-212`), four `exit=1` each with its own message, the control `exit=0`. No observed plan lists the set R8 names: S39 rewrites `biome.json` whole (1931 → 297 lines) and adds the plugin, so every ban of every scope is probed — 176 groups (`jq` at `8572da12bf`), the root's bans and the plugin's diagnostics as an added scope's own. S6 planted 50 (one per override), S8's script 18 (four overrides) |
| R9 | pass | `SKILL.md:46` names `mattpocock-skills:writing-for-agents` for an instruction-file diff; `reviewer.md:25-28` loads it, the rule wins; the no-op experiment at `SKILL.md:72-74` and `researcher.md:28-33`; `implementer.md:6-7` preloads only `tdd`, and no implementer file names the skill |
| R10 | pass | `.claude/skills/ticket-feature/SKILL.md:33-39` (step 2) runs `diagnosing-bugs` phases 1 and 2 before the grilling and the requirements, copies the command and output into `feature.md › Reproduction` (`docs/tickets/_template/feature.md:27-38`), and makes it the acceptance check (`:47-48`) |
| R11 | pass | `replay.md:14-29` covers the three Design steps (S10.1 again on opus), the two hunts (S8.1 again), the plan-time run on five steps and the S39 probes; all 19 hashes exist with their parents; every reviewer spawned with `effort: 'low'`; each pass time matches its transcript's `totalDurationMs` |
| R12 | pass | `docs/tickets/_template/verification.md:21-27`; summed by `.claude/skills/ticket-verify/SKILL.md:33-36` from the findings `.claude/skills/ticket-implement/SKILL.md:90-92` writes; this run's ledger below |
| R13 | pass | A verifier's no-op run, the skill with and without every loop line, both started with `loop`, haiku, 3 runs each: the loop's first step — with 0/3 ask the commit question ("the commit question … is waived"), without 3/3; a step not ready after three fix rounds — with 3/3 stop the loop ("I would stop rather than send a fourth fix round"), without 3/3 send a fourth round |

**Not verifiable:**

- R6's `unclear` branch: two claims built to be unsettleable (pool exhaustion, a race between two
  api processes) came back `refuted` by trace, as run 1's attempt did; only `claimed-findings.md:9`
  shows that `unclear` is asked.
- R8 in full: a skill-driven `/ticket-plan` session on S39 (176+ probes) was not run.
- R13's other stops (`BLOCKED:`, a user's decision, the user's word, no step left), and a real loop
  over several steps beyond this session's S9–S11.
- R4 and R5's variance: each step ran once under the current toolkit.

### Review

#### Review ledger

Summed from every step's **Findings** in `plan.md` (S1–S12); a finding raised by two passes counts
for each, S1 and S2 had none.

| Pass | Findings | Accepted | Fixed | Rejected |
|---|---|---|---|---|
| Standards | 20 | 11 | 11 | 9 |
| Spec | 29 | 21 | 21 | 8 |
| Replay (S6, not a review pass) | 2 | 2 | 0 | 0 |
| Implementer (out of scope, S10) | 1 | 0 | 0 | 0 (open) |

#### Standards

No hard breaks; `make doc-lint` exits 0. `.claude/CLAUDE.md` is 34 lines, `.claude/rules/sdd.md`
53; the commits read carry gitmoji, scope, `Decision:` and `Refs:`. Three judgement findings, from
`writing-for-agents`:

- `.claude/agents/reviewer.md:28` — Pruning — the instruction to load `writing-for-agents` on an
  instruction-file diff is stated twice, here and in the Standards row of
  `.claude/skills/ticket-implement/SKILL.md:46`.
- `.claude/skills/ticket-plan/SKILL.md:31-46` — Information hierarchy — step 3's **Verify** bullet
  carries the full guard-probe definition (scope, ban, overlap, plan-time output); every plan run
  reads it, only guard steps need it. A sibling file behind a pointer, as `claimed-findings.md`.
- `.claude/skills/ticket-implement/SKILL.md:56-81` — Information hierarchy, Co-location — steps 3
  and 4 are one long item; the `git diff -M` move definition sits inside the `simplify` sub-bullet
  though it routes Standards and Spec.

Not a rule break: a leftover `.claude/worktrees/toolkit-quality-plan-probes` folder, ignored by
git, which `git worktree list` does not show.

#### Spec

Four findings against `feature.md` R1–R13 and `architecture.md`:

- `.claude/agents/reviewer.md:55` — R4 — S9's rerun named the discarded result and judged it
  handled, missing the 500 of a send that loses to a delete (`replay.md:591-594`); no later step
  reruns it, while the coverage table lists R4 as observed.
- `.claude/skills/ticket-implement/claimed-findings.md:9` — R6 — the `unclear` branch was never
  observed (`replay.md:601-603`; run 1, "pass, in part") — claimed.
- `.claude/skills/ticket-plan/SKILL.md:32` — R8 — S39 rewrote the guard whole, so R8 asks for every
  scope; S8's rerun probes four overrides of 48 (`replay.md:490-494`) — judgement.
- `.claude/skills/ticket-plan/SKILL.md:58` — the Problem's L4 — the Red list asks only whether a
  check fails on today's tree; four of L4's five defects came back `fails as expected` though they
  could never pass after their step (`replay.md:607-612`); no step after S6 deals with it —
  judgement.

Checked with no finding: R1–R3, R5 (`path:line` from the file, L2), R9–R13, and every Structure row
of `architecture.md`.

### Simplifications

1. Move the guard-probe definition out of `.claude/skills/ticket-plan/SKILL.md:31-46` into a
   sibling file behind one pointer; every plan run stops reading ~15 lines only a guard step needs.
2. Lift the move definition out of the `simplify` sub-bullet of
   `.claude/skills/ticket-implement/SKILL.md:26-37` into its own bullet, since it decides which
   passes run; the routing reads in one place.
3. Cut `.claude/CLAUDE.md:20` ("Update `docs/knowledge/` in the commit that changes the behaviour
   it describes"), which `.claude/rules/sdd.md › Artifacts` owns; one line fewer loaded every
   session.

Not proposed: cutting the `writing-for-agents` clause from `SKILL.md:46` — R9's acceptance asks the
Standards brief to name it.

### Lessons

#### L1 — A step's check was run by the implementer, not the researcher its Verify names

- **Evidence:** S8 (the probes planted by a script in `git archive` exports, not by a researcher in
  a replay worktree; `git worktree list` could then not fail) and S12 (the implementer ran the no-op
  experiment itself and reworded the task until the two sides differed).
- **Cost:** S12's evidence was tuned; it took a round (S12.3) and two researcher reruns to find that
  the acceptance tested nothing the lines add.
- **Proposed change:** `.claude/agents/implementer.md`, Disciplines: "A Verify line that names a
  researcher is the main session's: report it as not run, with the command or task it needs."
- **Applied:** yes, S16

#### L2 — A check named in a plan could not fail on the break it was meant to catch

- **Evidence:** S10 (`make doc-lint` named for the links; two planted broken links passed),
  S12 (the no-op run asked whether the session continues, which the word `loop` decides on both
  sides), S8 (`git worktree list` with no worktree made), and the Problem's L4, open since run 1.
- **Cost:** a wrong check recorded in S10's plan, S12.3 and its reruns, and the Spec finding above.
- **Proposed change:** `.claude/skills/ticket-plan/SKILL.md` step 4: the Red run also plants, once,
  the break each check is meant to catch (a broken link, the line removed) and fixes in the plan
  every check that still passes.
- **Applied:** yes, S16

#### L3 — A rule's wording was changed in one place and left in its copies

- **Evidence:** S8 (R8, its acceptance row, the Probes contract, the template, the Seam and two
  Structure rows, fixed over S8.2–S8.5), S12 (the loop's stops in the skill, the guide and R13;
  the waiver in the rule and twice in the skill), S10 (the worktree rule twice in `researcher.md`).
- **Cost:** S8 took four fix rounds, one past the limit of three on the user's word; S12 a second
  round.
- **Proposed change:** `.claude/agents/implementer.md`, Disciplines: "Before changing a rule's
  wording, grep its old phrase across `.claude`, `docs/knowledge` and the ticket, and edit every
  copy in the same round."
- **Applied:** yes, S16

#### L4 — The reviewer cites lines from `cat -n` or a diff, not from `Read`

- **Evidence:** S5 and S9's replays (code read only through `Bash`), and this run's S8.1 re-run,
  after L2 of run 1 landed in `reviewer.md:64-65`: both lines on blank lines.
- **Cost:** a `shown` finding reaches the user with a wrong `path:line`; only a researcher corrects
  a `claimed` one.
- **Proposed change:** a mechanical check — a `PreToolUse` hook on the `reviewer` agent that
  refuses `cat`, `head`, `tail` and `sed -n` on a tracked file and names `Read`.
- **Applied:** yes, S17
