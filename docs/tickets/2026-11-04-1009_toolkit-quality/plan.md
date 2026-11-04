# Toolkit quality — plan

> Ticket: `2026-11-04-1009_toolkit-quality` · Requirements: [feature.md](./feature.md) · Design: [architecture.md](./architecture.md)

## Status

| Step | Delivers | Status |
|---|---|---|
| S1 | a behaviour finding carries its failure; a claimed one is confirmed first; each finding's pass and fate in `plan.md`, summed at verification | done |
| S2 | the Design pass in place of Depth, with its examples file | done |
| S3 | a plan's new checks run before it is presented; a guard's bans probed in a disposable worktree | done |
| S4 | writing-for-agents in the Standards pass of instruction edits; a bug ticket starts from a red command | todo |
| S5 | the replay of the Design pass and the hunt on five committed steps, with their wall time | todo |
| S6 | the replay of the plan-time run and the probes; the briefs seen as the skill writes them; the roadmap's re-count note | todo |

## How to run this plan

- Branch `chore/toolkit-quality`; commits by round, under the commit gate of
  `.claude/rules/sdd.md › Gates` (`/ticket-implement`).
- Each step leaves `make check` green and fits one fresh session (≤ ~400 changed lines, counted
  with `git diff -M --stat`).
- **No step here is a behaviour step** by `/ticket-implement`'s review test (none changes a `.ts`
  file, a `Makefile` recipe or a script), so each gets Standards and Spec alone; the Design pass
  and the hunt run only in the replays of S5 and S6. Every step still writes how the toolkit
  behaves, so each runs on `opus high`.
- **From S1 on, each step's findings use the pass-and-fate line** S1 adds to the template, so this
  ticket's verification fills the Review ledger (R12).
- Every edited skill, agent and template states the pattern, not this ticket's instances
  (`.claude/rules/claude-md.md › The pattern`); a step that changes what a skill or agent uses
  updates the dependency map of `docs/knowledge/sdd.md` in the same step.
- **The replay worktree** (S5, S6), set up by the main session before it spawns the implementer,
  since the implementer never checks out or commits: the commit's objects are local today
  (`git cat-file -e <hash>`), else `git fetch origin pull/<n>/head` for the PR that holds it;
  `git worktree add -b wt/<name> .claude/worktrees/<name> <parent>`; `.claude/agents/` and
  `.claude/skills/` copied from the ticket branch and committed on `wt/<name>`, so the session
  spawns the new agents while `.claude/rules/` and `docs/` stay the commit's and `git diff HEAD`
  shows only what is replayed; then `bun install`. No `.env`, no services. Name:
  `toolkit-quality-<step>-<what it replays>`. Removed by the main session after the step,
  worktree and branch, in a command of its own; `git worktree list` then shows none.
- S5 and S6 start in a new Claude Code session, so the main session and its agents load the
  files S1–S4 changed (D8). A replay session is `claude -p` run in its worktree, with
  `--permission-mode acceptEdits --allowedTools "Bash Read Glob Grep Agent Skill"
  --output-format stream-json --verbose`, since a `-p` session refuses a tool it may not use
  rather than asking; its prompt is quoted once in `replay.md`, with each run's values. `claude
  -p` is not in `.claude/settings.json`'s allow list, so the user approves each run.
- Entry 25 of the roadmap reads `done` in the ticket's squash commit, as earlier tickets did; no
  step sets it.
- A deviation is recorded in the step's findings, and in `architecture.md › Decisions` when it is a
  decision.

## Steps

#### S1 — Findings that carry their failure and their fate

- **Delivers:** a review finding about behaviour, a missing test included, names the input, the
  wrong outcome, the line it rests on, and whether a command showed it. The hunt asks of every
  construct that absorbs an error what it hides. A failure no command showed is checked by a fresh
  researcher before the user sees it. Each finding is recorded in `plan.md` with its pass and
  fate, and verification sums them per pass.
- **Goal:** R4, R5, R6 and R12, through D3, D4 and D9; Standards' rule finding keeps its line.
- **Blocked by:** none.
- **Files:**
  - `.claude/agents/reviewer.md`: the behaviour finding line of `architecture.md › Contracts`
    (*A finding about behaviour*), verbatim, for Spec and the hunt; Standards keeps
    `` - `path:line` — <rule or R…> — hard | judgement — <fix> ``. Spec owns a missing test,
    reported as that line. The hunt's bullet holds R4's question and its six kinds (a catch-all,
    a fallback, an ignore, a default for an absent value, a retry, an error folded into a
    refusal). Trap: name the kinds, not Effect APIs; Effect 4 renamed several, so an API list
    goes stale.
  - `.claude/skills/ticket-implement/SKILL.md`: step 3's hunt brief stays sources only (its
    question lives in the agent); step 4 sends each `claimed` finding verbatim to its own
    `researcher` on `model: opus`, all in parallel, and presents `confirmed` as the finding,
    drops `refuted` as rejected, asks `unclear` as a question with what the researcher could not
    settle; a behaviour finding without a scenario and a `path:line` is not presented. Step 5
    writes each finding with its pass and fate.
  - `.claude/agents/researcher.md`: a confirmation answers the two lines of *A confirmation*
    (`Verdict: confirmed | refuted | unclear`, `Evidence:`), by trace or an existing test or
    command, never a file planted in the tree.
  - `docs/tickets/_template/plan.md`: a `- **Findings:**` line under `- **Status:**`, in the shape
    of *A step's findings in `plan.md`*, its pass a placeholder (`<pass>`), not a list of today's
    passes.
  - `docs/tickets/_template/verification.md`: `#### Review ledger` under `### Review`, with the
    header `| Pass | Findings | Accepted | Fixed | Rejected |`.
  - `.claude/skills/ticket-verify/SKILL.md` step 2: the main session sums the ledger from the
    steps' findings in `plan.md`; no verifier reads `plan.md`.
  - `docs/knowledge/sdd.md`: `/ticket-implement` spawns a `researcher` per claimed finding (map
    row and graph); the bullets of *The commit gate* say a claimed failure is confirmed before
    it reaches you.
- **Size:** ~90.
- **Test first:** A template and the skill that fills it — today neither template holds a pass
  and fate or a ledger, and no agent file names `claimed`: the greps below find nothing.
- **Verify:**
  - `grep -n 'shown: <command> | claimed' .claude/agents/reviewer.md` — one hit; none today.
  - `grep -n 'a default for an absent value' .claude/agents/reviewer.md` — one hit; none today.
  - `grep -nE 'Verdict: confirmed \| refuted \| unclear' .claude/agents/researcher.md` — one hit;
    none today.
  - `grep -n 'claimed' .claude/skills/ticket-implement/SKILL.md` — a hit in step 4; none today.
  - `grep -n 'accepted, fixed in S<n>.2' docs/tickets/_template/plan.md` — one hit; none today.
  - `grep -n 'Review ledger' docs/tickets/_template/verification.md
    .claude/skills/ticket-verify/SKILL.md` — a hit in each; none today.
  - `grep -nE '^\| .?/ticket-implement.? \|.*researcher' docs/knowledge/sdd.md` — the map row;
    none today.
  - By hand: the hunt brief in `ticket-implement/SKILL.md` asks no question of its own.
  - `make check` green.
- **Model:** `opus high`
- **Status:** done
- **Findings:** Standards and Spec raised none.
  - Deviation: `docs/knowledge/sdd.md`'s *You decide* bullet also says where pass and fate are
    written and summed (D9), beyond the map row, graph and confirmation bullet the step lists.
  - Deviation: the contract left a Spec finding that is not about behaviour without a shape;
    `reviewer.md` gives it the rule line, and *A finding about behaviour* now says so.

#### S2 — The Design pass

- **Delivers:** on a behaviour step the review proposes at most five design changes, each with
  code before and after and a strength, looking for a narrower interface, composition in place of
  a wrapper per case, a pure function taken out of an effect, and a plainer implementation, each
  judged by cohesion and coupling. Its do and don't examples live in a file only that pass reads.
  The Depth pass is gone.
- **Goal:** R1, R2, R3, through D1 and D2; a move-only step still gets no shape pass; import
  direction stays Biome's.
- **Blocked by:** S1.
- **Files:**
  - `.claude/agents/reviewer.md`: the Design bullet replaces Depth, with the four lenses, the cap
    of five, most valuable first, the candidate format of *A Design candidate* verbatim, no
    candidate on import direction, a recorded decision re-opened only on real friction, a
    correctness bug left to the hunt; the description names `Design` in place of `Depth`.
  - `.claude/skills/ticket-implement/SKILL.md`: step 3's Design paragraph with the sources of
    *The Design brief* (including `design-examples.md` by its path and
    `.claude/rules/deep-modules.md`), still on the behaviour-step test only; the override row
    `the smell baseline` reads Design; step 4 presents the Design candidates in Depth's place.
  - `.claude/skills/ticket-implement/design-examples.md`, new: one do and one don't per lens, on
    an `Order` entity, each pair linking by anchor the rule example or `decisions.md` record it
    rests on, never copying it; a don't of a wrapper or a seam with one adapter (Risks). Traps:
    it is an instruction file to `make doc-lint`, whose source-path check also reads backtick
    spans inside code fences, so no template literal names a path ending in `.ts` or `.json`;
    each Effect API it uses is checked against `repos/effect` (effect 4.0.6), plain TypeScript
    where Effect is not the point.
  - `docs/knowledge/sdd.md`: the override row of `improve-codebase-architecture` and the Depth
    bullet of *The commit gate* name Design; the map's `reviewer` row adds it ("an axis of
    `code-review`, the Design pass or the hunt").
- **Size:** ~230, the examples file ~160 of it.
- **Test first:** A brief as the skill writes it — today the skill's review step names Depth and
  no examples file; the greps below find Depth and no `design-examples.md`.
- **Verify:**
  - `git grep -nw Depth -- .claude docs/knowledge README.md ':!docs/knowledge/roadmap.md'` — no
    hit; eight today (`reviewer.md`, `ticket-implement/SKILL.md`, `sdd.md`).
  - `git grep -l design-examples.md -- .claude` — `.claude/skills/ticket-implement/SKILL.md`
    only; nothing today.
  - `grep -n 'at most five' .claude/agents/reviewer.md` — one hit; none today.
  - No app noun in the examples' code:
    `awk '/^```ts/{f=1;next} /^```/{f=0} f' .claude/skills/ticket-implement/design-examples.md |
    grep -nE '(^|[^A-Za-z])(Chat|Message|Attachment|User|Job|Assistant|Reply)'` — no output; a
    planted `class ChatRepository {}` shows one. Cannot run before the file exists.
  - No example copied from a rule: the same `awk`, then
    `awk 'length($0) >= 25 { sub(/^[ \t]+/, ""); print }'`, piped to
    `/usr/bin/grep -Ff /dev/stdin .claude/rules/*.md` — no output; a line planted from
    `.claude/rules/deep-modules.md` shows one. `/usr/bin/grep`, since the session's `grep`
    prints every line on an empty pattern list.
  - The implementer's report lists each Effect API of the examples with its `repos/effect`
    `path:line`.
  - `make check` green.
- **Model:** `opus high`
- **Status:** done
- **Findings:** Standards and Spec raised none.

#### S3 — Plan checks that are seen to fail

- **Delivers:** before a plan is presented, every check for new work runs once on the tree as it
  stands, and one that passes there or cannot run is fixed in the plan. A step that changes or
  removes a guard holds one probe per ban the guard enforces today, each shown failing it in a
  disposable worktree, and runs the same probes after its change.
- **Goal:** R7 and R8, through D5; the Exists and Conforms lists stay; only the probes and their
  output stay in `plan.md`.
- **Blocked by:** S1.
- **Files:**
  - `.claude/skills/ticket-plan/SKILL.md`: step 3's Verify item asks for one probe per ban in the
    **Probes** shape of *The plan-time run*, a ban being one scope of the guard (a Biome
    override, a grep's pattern) probed by one import or line it refuses, each probe naming the
    command it fails (Biome alone, or `make check`). Step 4 adds the **Red** list to the
    researcher's lists (`fails as expected` with its output, `passes`, `cannot run` with its
    error), and for a guard-changing step a second `researcher` in the worktree
    `<slug>-plan-probes`, which the main session creates with
    `git worktree add -b wt/<slug>-plan-probes .claude/worktrees/<slug>-plan-probes HEAD`, sets
    up with `make worktree N=<n> NAME=<slug>-plan-probes` inside it, and removes with its branch
    and symlink in a command of its own, then checks `git worktree list`. Trap: `make worktree`
    renames the current branch, so on a detached worktree it fails. Step 4's last sentence keeps
    "`plan.md` records no check" except the probes.
  - `docs/tickets/_template/plan.md`: the `- **Probes** (<guard>, run at plan time):` sub-list
    under **Verify**, from the same Contract.
  - `.claude/agents/researcher.md`: its Bash line (experiments only in a temp directory outside
    the working tree) also allows planting files and running commands in a disposable worktree
    its brief names, never in the main tree.
  - `docs/knowledge/sdd.md`: the map row of `/ticket-plan` (the probe worktree).
- **Size:** ~45.
- **Test first:** The plan-time run on a past plan — the skill's step 4 today has no Red list
  and no probe worktree; the greps below find neither.
- **Verify:**
  - `grep -n 'fails as expected' .claude/skills/ticket-plan/SKILL.md` — one hit; none today.
  - `grep -n 'plan-probes' .claude/skills/ticket-plan/SKILL.md` — a hit; none today.
  - `grep -n 'run at plan time' docs/tickets/_template/plan.md` — one hit; none today.
  - `grep -n 'disposable worktree' .claude/agents/researcher.md` — one hit; none today.
  - `grep -nE '^\| .?/ticket-plan.? \|.*worktree' docs/knowledge/sdd.md` — the map row; none
    today.
  - `make check` green.
- **Model:** `opus high`
- **Status:** done
- **Findings:**
  - Spec — accepted, fixed in S3.2 — `.claude/agents/researcher.md:6` — R8 — judgement — the
    description said "Never edits the repository" while its Bash line allows planting probes in
    a disposable worktree, so a researcher could refuse to plant one; now "never edits the main
    tree".
  - Deviation: the probe worktree is removed with its branch only; its folder already bears the
    name, so `make worktree` makes no symlink (`.claude/skills/ticket-implement/worktree.sh`, the symlink line). It is
    removed with `--force`, since the planted probes are untracked.
  - Deviation: `docs/knowledge/sdd.md`'s `researcher` map row changed too, since it no longer
    writes nothing.

#### S4 — Instruction edits judged by running them; bug tickets from a red command

- **Delivers:** when a step edits an instruction file, the Standards pass also judges it by the
  writing-for-agents guidance, and a dispute over whether a line changes anything is settled by
  running the file with and without it; the project's rule wins a disagreement. A bug ticket
  starts from one command that shows the user's symptom failing, copied with its output into
  `feature.md`, and that command is the bug requirement's acceptance check.
- **Goal:** R9 and R10, through D6 and D7; the implementer's file and brief stay without
  `writing-for-agents`.
- **Blocked by:** S1.
- **Files:**
  - `.claude/agents/reviewer.md`: Standards, on a diff that touches an instruction file (every
    `CLAUDE.md`, `.claude/rules/`, `.claude/skills/`, `.claude/agents/`, the set `make doc-lint`
    treats as one), also loads `mattpocock-skills:writing-for-agents` and judges by it; where it
    and `.claude/rules/claude-md.md` disagree, the rule wins.
  - `.claude/skills/ticket-implement/SKILL.md`: step 3's Standards brief names
    `mattpocock-skills:writing-for-agents` when the diff touches an instruction file; step 4
    sends a dispute over a no-op line to a `researcher` as *The no-op experiment*.
  - `.claude/agents/researcher.md`: the no-op experiment's command,
    `claude -p --model haiku --setting-sources project`, run in two temporary folders outside the
    repository.
  - `.claude/skills/ticket-feature/SKILL.md`: before the call to `mattpocock-skills:grilling`, a
    bug (what the user reports as broken; asked when the input leaves it open) runs
    `mattpocock-skills:diagnosing-bugs` phases 1 and 2 only, to one command on the tree as it
    stands, never a new test file (D7; phase 1 lists a failing test first), or names the
    existing failing check; with none, it stops and asks the user, as phase 1 does.
  - `docs/tickets/_template/feature.md`: `## Reproduction` directly before `## Requirements`, in
    the shape of *A bug ticket's reproduction*, its comment saying only a bug ticket keeps it.
  - `docs/knowledge/sdd.md`: the map (`diagnosing-bugs` through `/ticket-feature`,
    `writing-for-agents` through `reviewer`), its graph, and the bug row of *When to run which
    cycle*.
  - Trap (D6): the user's own instructions live in `~/.claude/rules/` (no `~/.claude/CLAUDE.md`),
    and whether `--setting-sources project` keeps them out is unverified; the Verify below
    settles it before the researcher's line is written.
- **Size:** ~70.
- **Test first:** A template and the skill that fills it — today the feature template has no
  Reproduction and no agent names `writing-for-agents`; the greps below find nothing.
- **Verify:**
  - In an empty folder under the scratchpad, `claude -p --model haiku --setting-sources project
    "In which language are you told to answer? One word."`, then the same without
    `--setting-sources project`: the first names no language, or English; the second names
    Russian, in either script, from the user's `~/.claude/rules/`. If both name Russian, the
    flag lets the user's rules in: report it, and the researcher's line names the setting that
    keeps them out.
  - `grep -n 'writing-for-agents' .claude/agents/reviewer.md
    .claude/skills/ticket-implement/SKILL.md` — a hit in each; none today.
  - `grep -c 'writing-for-agents' .claude/agents/implementer.md` — `0`, before and after.
  - `grep -n 'setting-sources project' .claude/agents/researcher.md` — one hit; none today.
  - `grep -n '^## Reproduction' docs/tickets/_template/feature.md` — one hit, above the
    `## Requirements` line; none today.
  - `grep -nE 'diagnosing-bugs|mattpocock-skills:grilling' .claude/skills/ticket-feature/SKILL.md`
    — the `diagnosing-bugs` line comes first; today only the grilling call's line.
  - `make check` green.
- **Model:** `opus high`
- **Status:** todo

#### S5 — The replay of the review passes

- **Delivers:** `replay.md` holds what the Design pass reports on three committed behaviour
  steps and what the hunt reports on two steps that swallowed an error, each read against what
  was found later, with the confirmations of claimed failures and each pass's wall time, so the
  user judges each pass on outcome and time.
- **Goal:** R11's review part, and the observed evidence for R1–R6 (D8); no toolkit file changes.
- **Blocked by:** S1, S2.
- **Files:**
  - `docs/tickets/2026-11-04-1009_toolkit-quality/replay.md`, new: the table
    `| Pass | Step | Findings | Wall time |`; the prompt once, with each run's values; per run,
    the sources its brief named and lacked, the report, the verdicts, and each finding read
    against the later commit as `hit`, `near` or `miss`.
  - The set of *The replay set*, each round's diff applied uncommitted in a replay worktree at
    its parent, its own `plan.md` and `architecture.md` edits left out, as approval made them:

    | Pass | Step | Round ← parent | PR |
    |---|---|---|---|
    | Design | `llm-providers` S2.1 | `aead0e163d` ← `350e77ba7a` | #14 |
    | Design | `postgres-drizzle` S10.1 | `db5270171b` ← `76ea73d8bf` | #8 |
    | Design | `architecture-audit` S11.1 | `0859909545` ← `e0d228ace7` | #8 |
    | hunt | `architecture-audit` S30.2 | `af2e4c9682` ← `34673464f1` | #13 |
    | hunt | `postgres-drizzle` S8.1 | `a2c21e2502` ← `7a2c073f1d` | #8 |

  - Each session performs `/ticket-implement` steps 3 and 4 for its one pass, the hunt whatever
    its trigger says, every `reviewer` at effort `low`, and prints each report and verdict. In
    the S8.1 session the prompt adds two planted lines to the hunt's report: a behaviour finding
    with no scenario, and a `claimed` one at a `path:line` of the diff.
  - Traps: `.claude/rules/deep-modules.md`, `docs/knowledge/decisions.md` and
    `make review-rules` are absent at all five parents; the brief names what the parent has,
    and `replay.md` lists what it lacked. `bash-guard.sh` refuses the implementer a redirect into
    a file, so a session's output and each agent's `duration_ms` are read from its transcript
    under `~/.claude/projects/`.
- **Size:** ~320.
- **Test first:** The replay of a committed step — first, the S8.1 round's `touch` in
  `chat.service.ts` discards the update's answer (`Effect.asVoid`), the swallowed error its hunt
  is read against; checked at plan time, re-read before the run.
- **Verify:**
  - `replay.md` has five rows, each with a findings count and a wall time; fails on a blank cell.
  - Each Design report: at most five candidates, each with a before and an after sketch and a
    strength; none on import direction (R1, R2). Fails on a sixth candidate or a missing sketch.
  - Each Design brief names `design-examples.md` (R3).
  - The hunt's report on S8.1 or S30.2 names the swallowed construct and the failure it hides
    (R4); its absence is recorded as a miss, not dropped.
  - Every behaviour finding presented has an input → wrong outcome and a `path:line`; the
    planted one without a scenario is not presented (R5).
  - Every `claimed` finding, the planted one included, has a verdict before the presentation; an
    `unclear` one is presented as a question (R6).
  - `git worktree list` after the main session's removal shows no `toolkit-quality-S5-` tree.
  - `make check` green.
- **Model:** `opus high`
- **Status:** todo

#### S6 — The replay of the plan checks and the briefs

- **Delivers:** `replay.md` also holds what the plan-time run reports on five past steps whose
  checks were known to be broken, and what the probes show of a guard rewrite that lost bans,
  with their wall time. It shows the briefs as the skill writes them: an instruction edit's
  Standards brief names writing-for-agents and the implementer's does not; a move-only step gets
  no Design pass. The roadmap notes to re-count the checks that caught nothing.
- **Goal:** R11's plan part, the observed evidence for R1, R7, R8 and R9 (D8); every check of
  `make check` kept.
- **Blocked by:** S2, S3, S4.
- **Files:**
  - `docs/tickets/2026-11-04-1009_toolkit-quality/replay.md`: rows and reports for the
    plan-time run, the probes and the two brief runs.
  - The plan-time run, on PR #15's head: a session in a replay worktree at each parent performs
    `/ticket-plan` step 4's Red list for that one step's Verify, read from the parent's
    `plan.md`. Ground truth: L4 of `modular-monolith`'s `verification.md`.

    | Step | Round ← parent |
    |---|---|
    | S26 | `eb9da69b41` ← `55916f7ebc` |
    | S27 | `7e31071486` ← `25e08b941c` |
    | S30 | `73c11f56f0` ← `6cad5ef1a9` |
    | S36 | `35c69b96e4` ← `6fe0b488c4` (S37.1; S37 landed first) |
    | S37 | `6fe0b488c4` ← `17c552af21` |

  - The probes: a replay worktree `toolkit-quality-S6-s39-probes` at `8572da12bf`; a session
    performs step 4's probes for S39 against `biome.json` there (48 overrides), then S39's change
    (`dbb29d488a`) is applied there and the same probes rerun with `bunx biome check` on the
    probe files. Ground truth: L8, the overrides S39 dropped (`apps/api`, `apps/worker`,
    `deployment`) and what S43 (`89fdbcf073`) restored. Trap: a probe may still fail `tsc -b`
    after S39 (an undeclared dependency), so it is run against Biome alone.
  - The brief runs, each a session that prints the briefs `/ticket-implement` steps 2 and 3 would
    send, spawning nothing: `lean-instructions` S22, `8b6e947cca` ← `c57cf517b4` (PR #16); and a
    synthetic move, one `.ts` file renamed by `git mv` with its content unchanged, in a replay
    worktree at the ticket branch.
  - `docs/knowledge/roadmap.md` entry 25: the note to re-count each check of `make check` that
    caught nothing (the Effect style rules, the import bans, the web bundle check) after three or
    four tickets.
- **Size:** ~200, the probe list ~50 of it.
- **Test first:** The plan-time run on a past plan — each parent's `plan.md` holds its step's
  Verify (checked at plan time); L4 names the checks that could not fail, which the Red list is
  read against.
- **Verify:**
  - The plan-time run reports at least one `passes` or `cannot run` among the five steps' checks
    (R7); a run where every check `fails as expected` misses L4 and is recorded as such.
  - The probe list has one probe per override of `biome.json` at `8572da12bf`, each with its
    failing line; after S39's change, the probes of the dropped overrides no longer fail (R8).
    Fails when an override has no probe.
  - The S22 brief run: the Standards brief names `mattpocock-skills:writing-for-agents`, the
    implementer's brief does not (R9).
  - The synthetic move: no `simplify`, no Design, no hunt (R1).
  - `grep -n 'three or four tickets' docs/knowledge/roadmap.md` — one hit; none today.
  - `git worktree list` after the main session's removal shows no replay tree.
  - `make check` green.
- **Model:** `opus high`
- **Status:** todo

## Requirement coverage

| Req | Steps |
|---|---|
| R1 | S2; observed in S5, S6 |
| R2 | S2; observed in S5 |
| R3 | S2; observed in S5 |
| R4 | S1; observed in S5 |
| R5 | S1; observed in S5 |
| R6 | S1; observed in S5 |
| R7 | S3; observed in S6 |
| R8 | S3; observed in S6 |
| R9 | S4; observed in S6 |
| R10 | S4 |
| R11 | S5, S6 |
| R12 | S1; filled by this ticket's `/ticket-verify` |
