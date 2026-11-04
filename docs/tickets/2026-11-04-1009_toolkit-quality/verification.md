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
- **Applied:** accepted, lands as S11

#### L2 — Reviewers cite lines from `git diff` output, not from the file

- **Evidence:** S5's replay, four of four opus reviewers at `low` read code through `git diff` or
  `cat`; S8.1's four lines and S11.1's lines past the file's end, S30.2's one off; this run's R5
  caveat.
- **Cost:** every S8.1 line was wrong in the report; only the confirmations corrected them, and a
  `shown` finding gets none.
- **Proposed change:** `.claude/agents/reviewer.md`, the finding line: its `path:line` is read
  from the file at `HEAD` with `Read`, never from a diff hunk's position.
- **Applied:** accepted, lands as S11

#### L3 — A replay finding that fails this ticket's requirement was deferred, not fixed

- **Evidence:** S6 marked the move-only gap (R1) and the ban unit (R8) "accepted, open … left to
  the next ticket"; both fail here, as R1 and R8. The same S6 entry defers two more (below).
- **Cost:** two failed requirements and a fix step each after verification, where a fix in S6.2
  would have cost one round.
- **Proposed change:** `.claude/skills/ticket-implement/SKILL.md`, step 4: a finding that fails
  one of this ticket's requirements is fixed in the step's next round; only one outside them may
  stay `accepted, open`.
- **Applied:** accepted, lands as S11

#### Carried from `plan.md` › S6 (left to verification there)

- The Red list has no verdict for a check that fails today and can never pass after its step, the
  kind of three of L4's five defects. Proposed: `ticket-plan`'s Red list adds `cannot pass`,
  judged against the step's change; its own ticket, since it changes R7's verdict set.
- S22's Standards and Spec briefs carry `code-review`'s own asks against "names its sources and
  nothing else". Proposed: `ticket-implement` step 3 says the rule covers the main session's
  additions, and `code-review`'s axis asks pass unchanged.
