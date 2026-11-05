# Toolkit quality — plan

> Ticket: `2026-11-04-1009_toolkit-quality` · Requirements: [feature.md](./feature.md) · Design: [architecture.md](./architecture.md)

## Status

| Step | Delivers | Status |
|---|---|---|
| S1 | a behaviour finding carries its failure; a claimed one is confirmed first; each finding's pass and fate in `plan.md`, summed at verification | done |
| S2 | the Design pass in place of Depth, with its examples file | done |
| S3 | a plan's new checks run before it is presented; a guard's bans probed in a disposable worktree | done |
| S4 | writing-for-agents in the Standards pass of instruction edits; a bug ticket starts from a red command | done |
| S5 | the replay of the Design pass and the hunt on five committed steps, with their wall time | done |
| S6 | the replay of the plan-time run and the probes; the briefs seen as the skill writes them; the roadmap's re-count note | done |
| S7 | a step that only moves files and rewrites their imports gets Standards and Spec alone | done |
| S8 | a guard's probes are one per ban group, not one per scope | done |
| S9 | the hunt questions a discarded result; S8.1's hunt and S10.1's Design replayed again | done |
| S10 | the five simplifications of the verification | done |
| S11 | the verification's lessons L1–L3 | done |
| S12 | a loop over the plan's steps, each to a commit without the user's OK between them | done |
| S13 | the probes of every scope of S39's whole rewrite, one per ban; the S37 record corrected | done |
| S14 | one more attempt at R6's `unclear` branch, with a claim no trace or run settles | done |
| S15 | the second verification's three simplifications | done |
| S16 | the second verification's lessons L1–L3 | done |
| S17 | a hook refuses the reviewer's `cat`, `head`, `tail` and `sed -n` on a tracked file (L4) | done |
| S18 | a Verify that repeats one check over many inputs runs them from one script | done |
| S19 | a claim only a run outside the repo would settle gets `unclear`, not `refuted` | done |
| S20 | the model may run a `/ticket-*` skill when the user asks it to | done |
| S21 | no hook or instruction line refuses or steers which tool an agent reads, searches or edits with | done |
| S22 | the implementer's gate refuses to finish when it cannot find the agent's tree, instead of checking another one | todo |
| S23 | a `BLOCKED:` set in Markdown emphasis lets the implementer stop | todo |
| S24 | `rm -rf` is no longer denied: the deny stopped agents and protected nothing | done |
| S25 | `make worktree` refuses a number another live worktree holds, one whose ports pass 65535, and a renumbered worktree | todo |
| S26 | the lines that still named a read or search tool state what to read instead | todo |
| S27 | an agent's worktree branches from the ticket branch on every machine, not only the user's | todo |

## How to run this plan

- Branch `chore/toolkit-quality`; commits by round, under the commit gate of
  `.claude/rules/sdd.md › Gates` (`/ticket-implement`).
- Each step leaves `make check` green and fits one fresh session (≤ ~400 changed lines, counted
  with `git diff -M --stat`).
- **No step up to S21 is a behaviour step** by `/ticket-implement`'s review test (none changes a
  `.ts` file, a `Makefile` recipe or a script), so each gets Standards and Spec alone; the Design
  pass and the hunt run only in the replays of S5 and S6. Every step still writes how the toolkit
  behaves, so each runs on `opus high`. S22, S23 and S25 change a script, so they are.
- **S22–S27** fix what the audit of 2026-11-05 found by running the toolkit's scripts on stubbed
  input and against Claude Code's documentation. On the user's word they run in parallel, one
  worktree each (`.claude/skills/ticket-implement/parallel-steps.md`), and each lands on the
  ticket branch as one commit: its rounds commit in its worktree and are cherry-picked together.
  The scripts `hook-cases.sh` and `worktree-cases.sh` beside this plan hold their cases.
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
- **Status:** done
- **Findings:**
  - Standards — accepted, fixed in S4.2 — `.claude/skills/ticket-feature/SKILL.md:35` —
    writing-for-agents › Negation — judgement — the bug step led with "Never a new file"; it now
    states what the command runs on and where the failing test is written.
  - Standards — accepted, fixed in S4.2 — `docs/tickets/_template/feature.md:30` —
    writing-for-agents › Pruning — judgement — the Reproduction comment repeated the
    acceptance-check rule the skill holds; cut from the template.
  - Standards — rejected: this step's Seam requires the Standards brief to name
    `writing-for-agents` — `.claude/skills/ticket-implement/SKILL.md:43` repeats the trigger
    `reviewer.md` carries.
  - Spec — rejected: shown by the implementer's run, where a folder `CLAUDE.md` asking for French
    got `Française.` under the flag — `.claude/agents/researcher.md:30`, the folder's `CLAUDE.md`
    loading under `--setting-sources project`, claimed.
  - Verify, the flag: `--setting-sources project` answered `None`, without it `Русский`; D6's
    *Cost accepted* now states it.
  - Deviation: an instruction file is defined by its four kinds, since `make doc-lint` lints all
    Markdown and only its source-path check is limited to them; D6's *Why* says so.
  - Deviation: `docs/knowledge/sdd.md` also gained the `diagnosing-bugs` override row and the two
    skills in *After a plugin update*; `/ticket-feature`'s steps are renumbered after the new
    step 2.

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
- **Status:** done
- **Findings:**
  - Spec — accepted, fixed in S5.2 — `replay.md`, the R6 line — R6 — judgement — no researcher
    answered `unclear`, so its question path was never seen; now stated as unobserved, left to
    the verification.
  - Spec — accepted, fixed in S5.2 — `replay.md`, the R5 line — R5 — judgement — the reviewers'
    own lines were diff positions (S8.1) or past the file's end (S11.1), right only after the
    confirmations; the line now says so.
  - Spec — accepted, fixed in S5.2 — `replay.md`, the summary — R11 / D8 — judgement — S10.1's
    reviewer ran on fable, yet the summary counted it; the summary now reads the four opus runs.
  - Replay: at effort `low`, four of the four opus reviewers read the code through `git diff` or
    `cat`, not `Read`, and cited lines from that output; the default effort is the user's call
    once they read the replay (D8).
  - Replay: the hunt on S8.1 missed `touch`'s `Effect.asVoid` and said "I found no silent
    fallback in `ChatRepositoryPg.update`"; recorded as a miss (R4).
  - Deviation: a pass's wall time is its reviewer's time plus a resent round plus the span of its
    parallel confirmations; the five sessions ran at once.
  - Deviation: a finding is a hit on any later commit that made it, not only the *Found later*
    column; *The replay set* says so.
  - Deviation: the main session set up the five worktrees with the round's diff applied, and
    removed them and their branches after the run; `git worktree list` shows none.

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
  - Every replay prompt names the model of each agent it spawns, as the skill states it; a `-p`
    session otherwise picks one from the user's memory (S5's S10.1 ran on fable).
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
- **Status:** done
- **Findings:**
  - Spec — accepted, fixed in S6.2 — `replay.md`, the probe list — R8 — judgement — the probes
    are one per override (48 overrides, 176 ban groups at `8572da12bf`), so R8's per-ban ask is
    observed in part and four of L8's bans had no probe of their own; now stated.
  - Spec — accepted, fixed in S6.2 — `replay.md`, the probes summary — R8 — judgement — "37 of 50
    bans" counted probes as bans; now "37 of 50 probes".
  - Spec — accepted, fixed in S6.2 — `replay.md`, the plan-time rows — R7 — judgement — S26, S27
    and S36 read as L4 hits though their defects came back `fails as expected`; now misses at the
    verdict, hits only in the researcher's note.
  - Replay — accepted, open — the Red list has no verdict for a check that fails today and can
    never pass after its step, the kind of three of L4's five defects; left to a ticket of its
    own (`verification.md` Lessons).
  - Replay — accepted, open — a real move rewrites its importers' `.ts` lines, so the skill's
    test makes it a behaviour step and R1's "no design pass on a move" holds only for a rename
    with untouched importers; S22's Standards and Spec briefs carry `code-review`'s own asks
    against "names its sources and nothing else"; `/ticket-plan` counts a ban as an override,
    R8 as a ban group. All three left to the next ticket (`verification.md` Lessons).
  - Decision, the user's, after reading S5's replay: the reviewer's default effort stays
    `medium` (D8).
  - Deviation: the S22 tree keeps its own `.claude/`, since S22's diff edits the files the replay
    would commit; its session read the ticket's skill and agents by absolute path.
  - Deviation: the gate is the main tree's `make check`; the synthetic-move tree is red by design
    (`packages/aws/index.ts(1,37): error TS2307: Cannot find module '#aws/naming'`).
  - Deviation: a probe fails by its ban diagnostic, not the exit code, since `biome check` exits 1
    on formatting alone (P42, P45, P48).

#### S7 — A move is no behaviour step

- **Delivers:** a step whose diff only renames files and rewrites the import lines that name them
  gets Standards and Spec alone, as a rename with untouched importers does today; a step that
  changes any other line of a `.ts` file, a `Makefile` recipe or a script stays a behaviour step.
- **Goal:** R1's "a move-only step gets no design pass" (D1), from `verification.md` run 1.
- **Blocked by:** none.
- **Files:**
  - `.claude/skills/ticket-implement/SKILL.md:27-29`: the one test of a behaviour step names the
    move, its renamed files and its rewritten import lines, as the exception.
  - `docs/knowledge/sdd.md:141`: "A pure move skips it" says the same.
- **Size:** ~10.
- **Test first:** A brief as the skill writes it — the verification's case, `git mv
  packages/aws/naming.ts packages/aws/names.ts` with both importers rewritten to `#aws/names`,
  today gets `simplify` and Design.
- **Verify:**
  - The same case, in a replay worktree at the ticket branch, run as `/ticket-implement`'s main
    session printing the passes it would run, spawning nothing: Standards and Spec alone. Fails
    on `simplify`, Design or the hunt.
  - The same worktree with one more changed line in a moved file: `simplify` and Design. Fails
    when the move exception swallows it.
  - `make check` green.
- **Model:** `opus high`
- **Status:** done
- **Findings:** passes that ran: Standards (sonnet, with writing-for-agents) and Spec; no
  `simplify`, Design or hunt, an instruction-only step.
  - Spec — accepted, fixed in S7.2 — `export … from` in `index.ts` is a re-export, not an import
    line, so the literal exception missed the verification's own case (confirmed by a researcher).
  - Spec and Standards — rejected: `.misc/lint/biome-imports.grit:83-86` bans relative paths, and
    a `#<unit>/…` line stays the same when its file moves inside its unit — a moved file's own
    relative imports would change under `git diff -M`.
  - Spec — rejected: the main session ran both in a replay worktree at the ticket branch, as fresh
    opus agents playing the main session; move: "simplify: no … Standards: yes … Spec: yes … the
    hunt: no … Design: no"; with `-dlq` → `-dead-letter` in `names.ts`: "simplify: yes …
    Standards: yes … Spec: yes … The hunt: no … Design: yes"; the worktree is removed — no record
    that Verify 1–2 ran.
  - Standards — accepted, fixed in S7.2 — `docs/knowledge/sdd.md` restated the skill's definition
    of a move.
  - Standards — accepted, fixed in S7.2 — the S7.1 rewrap left ragged lines in `SKILL.md`.

#### S8 — One probe per ban group

- **Delivers:** a step that changes or removes a guard plants one probe per ban the guard
  enforces, a ban being one restriction with its own message (a pattern or a path of a Biome
  override, a grep's pattern), for each scope the step changes or removes; a guard rewritten whole
  probes every group.
- **Goal:** R8 (D5), from `verification.md` run 1; the Probes shape of the template stays.
- **Blocked by:** none.
- **Files:**
  - `.claude/skills/ticket-plan/SKILL.md:32-33`: the ban's definition and which scopes are probed.
  - `docs/tickets/_template/plan.md`, the Probes comment, if it names the unit.
  - `docs/tickets/2026-11-04-1009_toolkit-quality/replay.md`: the probes section gains the rerun
    below, with its wall time.
- **Size:** ~60, the probe list ~40 of it.
- **Test first:** The plan-time run on a past plan — at `8572da12bf`, the overrides of
  `apps/api/**`, `apps/worker/**` and `deployment/**` hold more groups than S6's one probe each.
- **Verify:**
  - In a replay worktree at `8572da12bf`, a researcher plants one probe per group of those three
    overrides and the domain tests' one, each failing Biome with its own message; after S39's
    change (`dbb29d488a`), the probes of L8's four lost bans no longer fail. Fails when a group
    has no probe or two groups share one.
  - `git worktree list` after the main session's removal shows no replay tree.
  - `make check` green.
- **Model:** `opus high`
- **Status:** done
- **Findings:** passes that ran: Standards (sonnet, with writing-for-agents) and Spec, on each of
  rounds S8.1–S8.5; no `simplify`, Design or hunt, an instruction-only step. S8.5 is a fourth fix
  round, past the three, on the user's word. The step grew past its Delivers: a step that adds a
  guard or a scope, the scopes an added override shadows, a Biome plugin's and the root config's
  bans; R8, its acceptance row and the Probes contract follow. `docs/knowledge/sdd.md:65`, outside
  the step's Files, names the three kinds of guard step.
  - Standards — accepted, fixed in S8.2 — `replay.md` counted 14 probes that stop failing after
    S39; its list holds 13 "after: passes" and 5 "after: fails (plugin)" (confirmed by a
    researcher).
  - Spec — accepted, fixed in S8.2 — R8 and its acceptance row still asked for every ban the guard
    enforces while the skill probes the scopes a step touches (confirmed by a researcher).
  - Spec — accepted, fixed in S8.2 — a Biome plugin was no scope, so its five registered
    diagnostics got no probe (confirmed by a researcher).
  - Standards — accepted, fixed in S8.2 — the Verify item of `/ticket-plan` step 3 was one run-on
    sentence of three rules.
  - Spec — rejected: the outputs are Biome's own, and `replay.md` says how it ran — the rerun ran
    by script in `git archive` exports, not by a researcher in a replay worktree, so Verify 2
    (`git worktree list`) could not fail.
  - Spec — accepted, fixed in S8.3 — an added override replaces an earlier one's options for the
    files both match, so the shadowed scope's bans were lost with no probe asked for (confirmed by
    a researcher on Biome 2.5.15: `apps/api/x.ts` reported only "apps ban").
  - Spec and Standards — accepted, fixed in S8.3 — the Seam row named a whole rewrite only; a
    sub-bullet ended in `;`; the Probes contract ran past 100 columns.
  - Spec and Standards — accepted, fixed in S8.4 — the added-scope exception was missing from the
    Probes contract, the template comment and the Seam row; R8's trigger left out adding a guard;
    the scope rule was written out in four places.
  - Standards — rejected: D5 says the probes keep their output and rerun after the change, not
    that each fails at plan time — D5 contradicted the added-scope exception.
  - Spec — accepted, fixed in S8.5 — R8's acceptance row, D5's cost line, two Structure rows and
    `docs/knowledge/sdd.md:65` still said "a guard-changing step"; the Probes contract no longer
    pointed to step 3 for a ban.
  - Standards — rejected: the plan's Goal keeps the template's Probes shape — the placeholder
    `<the guard's failing line>` should read the plan-time output.
  - Standards — rejected: a requirement reads on its own — R8 restates the scope list step 3 owns.
  - Standards and Spec — rejected: no rule sets the width of a ticket file and `make check` is
    green; "guard change" and "adds, changes or removes a guard" without "or a scope of one" are
    summaries that point to step 3 — `architecture.md:135` runs to 140 columns, and the Seam row
    and Structure rows use the short form.

#### S9 — The hunt questions a discarded result

- **Delivers:** the hunt also asks which failure a discarded result hides (a write's answer turned
  into nothing); the replay holds a second hunt on `postgres-drizzle` S8.1 and a Design run on
  `postgres-drizzle` S10.1 on opus, each with its findings and wall time.
- **Goal:** R4, and R11's three Design steps on one model, from `verification.md` run 1; the rule
  names the pattern, not this code (`claude-md.md › The pattern`).
- **Blocked by:** none.
- **Files:**
  - `.claude/agents/reviewer.md:56-58`: the construct list of the hunt.
  - `docs/tickets/2026-11-04-1009_toolkit-quality/replay.md`: two rows and their reports, read
    against the later commits as S5's were.
  - The replay as in S5: each round's diff applied uncommitted in a replay worktree at its parent
    (S8.1 `a2c21e2502` ← `7a2c073f1d`, S10.1 `db5270171b` ← `76ea73d8bf`), every `reviewer` at
    effort `low`, the prompt naming each agent's model.
- **Size:** ~120.
- **Test first:** The replay of a committed step — S5's hunt on S8.1 said "I found no silent
  fallback in `ChatRepositoryPg.update`" over `touch`'s `Effect.asVoid`.
- **Verify:**
  - `grep -n 'discarded result' .claude/agents/reviewer.md` — one hit; none today.
  - The S8.1 hunt names `touch`'s discarded update and the failure it hides; a second miss is
    recorded as a miss, not dropped (R4).
  - The S10.1 Design reviewer's model is opus in its transcript; its report keeps R2's shape.
  - `git worktree list` after the main session's removal shows no replay tree.
  - `make check` green.
- **Model:** `opus high`
- **Status:** done
- **Findings:** passes that ran: Standards (sonnet, with writing-for-agents on S9.1) and Spec, on
  S9.1 and S9.2; no `simplify`, Design or hunt, an instruction-only step. The replay trees were
  set up before the step's `reviewer.md` existed, so the implementer copied it into each, hidden
  from `git diff HEAD` by `--skip-worktree`; the S9 prompt names opus for every agent and drops
  the planted lines. Verify 2: the hunt named the construct and judged it handled — "`touch` and
  `writeSettled` drop the 'wrote or not' answer. That only matters when the chat was deleted at
  the same time, which the job already handles" — a second miss on the failure, recorded as one.
  Verify 4: `git worktree list` after the removal lists the main tree and the two
  `client-publishing` trees, no replay tree.
  - Spec — accepted, fixed in S9.2 — R4's list of constructs lacked the discarded result
    `reviewer.md` now names.
  - Spec — accepted, fixed in S9.2 — `replay.md` read one rerun as variance, which the replay's
    Seam says it cannot show.
  - Standards — rejected: the limit still holds for every step run once — the Seam row's "the
    variance of one run per step" should narrow to S8.1's two runs.
  - Spec — rejected: the Seam row's Misses holds the caveat on purpose — the dropped variance
    reading should stay in `replay.md`.

#### S10 — The verification's simplifications

- **Delivers:** the instruction files hold each fact once: `.claude/CLAUDE.md` without the lines a
  rule or `sdd.md` owns, the examples' don'ts as a snippet and a link, step 4's confirmation
  behind a pointer, the probe procedure in `researcher.md` alone, and `sdd.md`'s bug row readable.
- **Goal:** `verification.md` run 1 › Simplifications 1–5; no behaviour changes.
- **Blocked by:** S7, S8, S9, which edit the same skills.
- **Files:**
  - `.claude/CLAUDE.md:11-12`, `:19-20`, `:24-26`.
  - `.claude/skills/ticket-implement/design-examples.md:23-60`, `:76-80`.
  - `.claude/skills/ticket-implement/SKILL.md`, step 4's confirmation, to a sibling file; the
    orphan line.
  - `.claude/skills/ticket-plan/SKILL.md`'s researcher brief and `.claude/agents/researcher.md`.
  - `docs/knowledge/sdd.md`, *When to run which cycle*, row 2.
- **Size:** ~80.
- **Test first:** `make check` over the edited skills, agents and templates — the links of the
  moved confirmation and of the shortened don'ts resolve.
- **Verify:**
  - `git grep -n 'Substance is new behaviour' .claude/CLAUDE.md` — no hit.
  - Every link of `design-examples.md` and the new sibling file resolves (`make doc-lint`).
  - `make check` green.
- **Model:** `opus high`
- **Status:** done
- **Findings:** passes that ran: Standards (sonnet, with writing-for-agents) and Spec, on S10.1
  and S10.2; no `simplify`, Design or hunt, an instruction-only step. The Effect and Drizzle line
  of `.claude/CLAUDE.md` stays as a pointer to `effect.md`, which loads on a `.ts` file only.
  Verify 1: `git grep -n 'Substance is new behaviour' .claude/CLAUDE.md` exits 1.
  - Spec — accepted, fixed in S10.2 (`plan.md`, `architecture.md`) — Test first and Verify 2 name
    `make doc-lint` for the links, which checks none: with two broken links planted it "printed
    nothing and exited 0"; only CI's `links` job (`lychee --offline`) does. The links were checked
    by the implementer's relative-link script ("all 25 links of the seven edited files resolve")
    and by Spec's `[ -e ]` loop (none missing); the `make check` Seam row lists a broken link
    under Misses.
  - Standards — accepted, fixed in S10.2 — `researcher.md` stated the disposable-worktree rule in
    two bullets.
  - Standards — accepted, fixed in S10.2 — the cut left `.claude/CLAUDE.md`'s substance sentence
    without its period.
  - Spec — rejected: it describes how Claude Code loads files, which no doc of this repo owns —
    the cut line on layer `CLAUDE.md`s and rules loading on their own has no other home.
  - Implementer — rejected in S15.2, outside the verification's list — `.claude/CLAUDE.md:20`,
    "Update `docs/knowledge/` in the commit that changes the behaviour it describes", repeats
    `.claude/rules/sdd.md › Artifacts` — that rule loads only for ticket, roadmap and skill
    files, so a code change outside a ticket reaches the duty only through `.claude/CLAUDE.md`.

#### S11 — The verification's lessons

- **Delivers:** a report counts in the requirement's unit and only the runs that meet its
  conditions; a reviewer reads `path:line` from the file; a finding that fails one of the ticket's
  requirements is fixed in the step's next round.
- **Goal:** `verification.md` run 1 › Lessons L1–L3.
- **Blocked by:** S10, which edits `ticket-implement` step 4.
- **Files:**
  - `.claude/agents/implementer.md`: L1's line.
  - `.claude/agents/reviewer.md`, the finding line: L2's.
  - `.claude/skills/ticket-implement/SKILL.md`, step 4: L3's.
  - `docs/tickets/2026-11-04-1009_toolkit-quality/verification.md`: each lesson's **Applied:**
    reads `yes, S11`.
- **Size:** ~15.
- **Test first:** A brief as the skill writes it — today no agent file asks for a line read from
  the file, and step 4 lets a failing requirement stay `accepted, open`.
- **Verify:**
  - `grep -n 'Applied:\*\* yes, S11' docs/tickets/2026-11-04-1009_toolkit-quality/verification.md`
    — three hits.
  - `make check` green.
- **Model:** `opus high`
- **Status:** done
- **Findings:** passes that ran: Standards (sonnet, with writing-for-agents) and Spec on S11.1;
  no `simplify`, Design or hunt, an instruction-only step. L2's line drops "at `HEAD`": the step
  under review is uncommitted, so `Read` cites the working tree. Verify 1: `grep -n
  'Applied:\*\* yes, S11'` gives `161:`, `172:` and `183:`.
  - Spec — rejected: in the skill "a fix you recommend" is what step 5 sends as the next round,
    in a loop without asking, and the clause after it forbids `accepted, open` for a finding that
    fails an `R…` — L3's line says "a fix you recommend for the step's next round" where L3 says
    "is fixed in the step's next round".

#### S12 — A loop over the plan's steps

- **Delivers:** `/ticket-implement <ticket> loop` takes step after step to a commit, with the
  stops of R13; the commit gate states that the loop waives the OK between steps, not the OK for
  a push, a PR or a merge.
- **Goal:** R13 (D10).
- **Blocked by:** none.
- **Files:**
  - `.claude/skills/ticket-implement/SKILL.md`: the loop argument; step 6 returns to step 1 in a
    loop; the stops.
  - `.claude/rules/sdd.md › Gates`, the commit gate: the loop's waiver.
  - `docs/knowledge/sdd.md`: how to start and stop a loop.
- **Size:** ~40.
- **Test first:** A brief as the skill writes it — the no-op experiment of R13: today step 6
  names the next step and stops.
- **Verify:**
  - A researcher runs the experiment of R13 on the skill before and after; the answers differ.
  - `make check` green.
- **Model:** `opus high`
- **Status:** done
- **Findings:** passes that ran: Standards (sonnet, with writing-for-agents) and Spec on S12.1
  and S12.2; no `simplify`, Design or hunt, an instruction-only step. S12.3 is the main session's
  edit of R13's acceptance row and the Seam row after the rerun below, with no review of its own.
  The Test first was wrong: today's step 6 does not stop a session started with `loop`.
  - Spec — accepted, fixed in S12.3 — Verify was run by the implementer, its task telling the
    model to act only on the file; a researcher's own task on haiku, 6 runs a side, continued on
    both sides ("Because the session was started with `loop`, I continue rather than stop"), so
    the acceptance row tested nothing the lines add. Rewritten to two cases and rerun by a
    researcher on haiku and opus, 3 runs per model and side: at the loop's first step, before
    6/6 ask the commit question, after 0/6 ("Step 2 asks it only at the session's first step
    outside a loop"); after three fix rounds, before 6/6 offer a fourth round ("a fourth round
    follows the same path as the first three"), after 6/6 stop the loop with the tree as is
    ("The loop stops here. S3 has hit the third exit condition").
  - Spec — accepted, fixed in S12.2 — R13 stopped when no `todo` step remains, the skill when no
    unblocked one does (confirmed by a researcher).
  - Spec — accepted, fixed in S12.2 — the guide promised a stop on the user's word that the skill
    did not list, and said the step stays uncommitted though its first round is committed
    (confirmed by a researcher).
  - Spec — accepted, fixed in S12.2 — the Seam row of a brief as the skill writes it did not
    cover R13, and then implied the run poses a stop.
  - Standards — accepted, fixed in S12.2 — the waiver was stated in the rule and twice in the
    skill; the stop list in the skill and the guide; step 4's deferral as a negation.
  - Standards — rejected: `docs/knowledge/decisions.md` holds decisions that bind the code, none
    on the commit gate (refuted by a researcher) — the changed gate needs a record there.
  - Standards — rejected: the loop stays in one section, which the skill's opening links — the
    stop list belongs in step 6.


#### S13 — The probes of a whole rewrite

- **Delivers:** a probe per ban of every scope `/ticket-plan` step 3 names for S39, which rewrites
  the guard whole and adds the plugin: each override's groups, the root config's bans, and the
  plugin's diagnostics as an added scope's own; each with its output at `8572da12bf` and after
  S39 (`dbb29d488a`). The S37 row of the plan-time run records `doc-width` and `make check` as
  they ran on a clean parent.
- **Goal:** R8, from `verification.md` run 2; R7's record (run 2, R7 row).
- **Blocked by:** none.
- **Files:**
  - `docs/tickets/2026-11-04-1009_toolkit-quality/probes-s39.md`: **new**, the probe list in the
    template's Probes shape, one line per probe.
  - `docs/tickets/2026-11-04-1009_toolkit-quality/replay.md`: the probes section points to it,
    with its counts and wall time; S37's `doc-width` row and the "one `passes`" summary.
- **Size:** ~250, the list most of it.
- **Test first:** The plan-time run on a past plan — at `8572da12bf`, `jq` counts 176 restriction
  groups across the overrides, and the S8 rerun probed 18.
- **Verify:**
  - Per override, the distinct messages among its probes equal its groups, by the same `jq` count;
    a group with no probe or two groups sharing one fails it.
  - Every probe but the plugin's fails at `8572da12bf` with its own message; the plugin's fail
    after S39, G1 only after it: G2 fails before on the root's pattern, as no relative import
    was free at `8572da12bf`.
  - `make check` green.
- **Model:** `opus high`
- **Status:** done
- **Findings:** passes that ran: Standards (sonnet) and Spec on S13.1 and S13.2; no `simplify`,
  Design or hunt, a docs-only step. The probes ran by script in `git archive` exports, not by a
  researcher in a worktree, as S8's; the Verify names none and planted hits turned each check red
  first. S13.2's run: `probes 180; wall 33.6 s; overrides 48; groups 176; own messages 176`,
  `before: 179 fail, G1 pass`, `after: 13 fails, own message / 88 fails, plugin / 7 fails,
  reworded / 71 passes / 1 fails, noImportCycles`, `errors: 0`.
  - Spec — accepted, fixed in S13.2 — S37's `make check` also passes on a clean parent (confirmed
    by a researcher: `Tests  213 passed (213)`, `Tests  102 passed (102)`, exit 0), so S37's three
    checks all pass and R7's record counts three `passes`.
  - Spec — accepted, fixed in S13.2 — the list did not show which probe holds each of the 15 bans
    of the nine overrides at `dbb29d488a`; it now maps them, and P8.1 takes an import only its ban
    refuses on both commits (rerun by a researcher: one diagnostic each, `errors: 0`).
  - Spec — accepted, fixed in the Verify — G2 cannot fail after S39 only: the root refused every
    relative import at `8572da12bf`.
  - Spec — accepted, fixed in the Delivers — S13.2 records `make check` on the clean parent, which
    the Delivers named only as `doc-width`.
  - Implementer — accepted, open — the seven `#testing/**` groups have no import their ban alone
    refuses, as `/ticket-plan` step 3 asks: the module group shadows each; the list names both
    messages.
  - Spec — rejected: a widened glob after S39 reaches no file the old overrides missed, and each
    of the 15 new bans has a probe (refuted by a researcher) — the added scopes' reach is unprobed.
  - Spec — rejected: P8.1's import came from a rerun at both commits (refuted by a researcher) —
    nothing shows it fails before S39.
  - Spec — rejected: the commit's `Decision:` records that P8.1's import replaces the candidate
    list's — the list should say whether the import is on it.
  - Standards — rejected: the trailer names the model that writes the commit, Opus — the
    reviewer's own Sonnet.

#### S14 — An unclear confirmation, seen

- **Delivers:** a replay of `/ticket-implement` step 4 on a round with a planted `claimed` finding
  that neither a trace of the code nor a run in the tree can settle (a limit of a production
  service, say); the researcher's verdict and whether the main session asks it as a question.
- **Goal:** R6's `unclear` branch, from `verification.md` run 2.
- **Blocked by:** S13, which edits `replay.md`.
- **Files:**
  - `docs/tickets/2026-11-04-1009_toolkit-quality/replay.md`: the run, its prompt, the verdict
    quoted and its wall time.
  - The replay as in S9: a worktree at `7a2c073f1d` with round `a2c21e2502` applied uncommitted,
    set up and removed by the main session.
- **Size:** ~40.
- **Test first:** The replay of a committed step — runs 1 and 2 planted two such claims each, and
  each came back `refuted`.
- **Verify:**
  - The researcher answers `unclear` and the session's presentation holds the finding as a
    question with what could not be settled; a `refuted` or `confirmed` answer is recorded as such,
    with the claim that drew it.
  - `git worktree list` after the main session's removal shows no replay tree.
  - `make check` green.
- **Model:** `opus high`
- **Status:** done
- **Findings:** passes that ran: Standards (sonnet) and Spec on S14.1; S14.2's two fixes checked
  by the main session against their findings, with no review of their own. The researcher
  answered `refuted` in 67 s ("the rollback is what the replayed ticket's R6 requires"; the SDK
  retries `SlowDown`, `DEFAULT_MAX_ATTEMPTS = 3`), and also wrote "nothing in the repo shows that
  a chat send burst would pass S3's per-prefix request rate": R6's `unclear` branch is still
  unobserved.
  - Spec — accepted, open — the plant was settled from the tree, by the replayed ticket's R6 and
    the installed SDK's defaults; only the burst rate was left open.
  - Spec — accepted, fixed in S19 — `researcher.md` gives `unclear` only to what a new test would
    settle, so a claim only production shows cannot reach it.
  - Spec — accepted, fixed in S14.2 — the section leaned on the S9 setup for its commits.
  - Standards — accepted, fixed in S14.2 — a Russian quote in an English doc.
  - Implementer — rejected: `replay.md:423` quotes the session's "Нет" with its gloss "(none)" —
    the same rule as the S14.2 fix.

#### S15 — The second verification's simplifications

- **Delivers:** the guard-probe definition of `/ticket-plan` step 3 in a sibling file behind one
  pointer; the move definition of `/ticket-implement` its own bullet, out of `simplify`'s.
  `.claude/CLAUDE.md` keeps the line `sdd.md › Artifacts` repeats (Simplification 3 rejected).
- **Goal:** `verification.md` run 2 › Simplifications 1–3; no behaviour changes.
- **Blocked by:** none.
- **Files:**
  - `.claude/skills/ticket-plan/SKILL.md:31-46` and a new sibling file.
  - `.claude/skills/ticket-implement/SKILL.md:26-37`.
  - `.claude/CLAUDE.md:20`.
- **Size:** ~50.
- **Test first:** `make check` over the edited skills, agents and templates — the relative-link
  script over the edited skills: the link to the new file resolves (`make doc-lint` checks only
  backticked repo-root paths).
- **Verify:**
  - Every relative link of the edited files resolves, by a relative-link script (CI's `links` job
    runs `lychee --offline`).
  - `make check` green.
- **Model:** `opus high`; run on `opus medium`, as a move of text
- **Status:** done
- **Findings:** passes that ran: Standards (sonnet, with writing-for-agents) and Spec on S15.1
  S15.2; S15.3 checked by the main session against its finding. No `simplify`, Design or hunt, an
  instruction-only step. Implementer 4, 2 and 1.5 min on `opus medium`.
  - Standards — accepted, fixed in S15.2 — cutting `.claude/CLAUDE.md`'s `docs/knowledge/` line
    loses the duty for a code change outside a ticket: `sdd.md` loads for ticket, roadmap and
    skill files, `claude-md.md` for `CLAUDE.md`, `.claude/` and `docs/knowledge/`; the line is
    restored and Simplification 3 rejected.
  - Spec — accepted, fixed in the Test first — the pointer is a relative link, which `make check`
    does not see: with `guard-probes.md` moved away `make doc-lint` still exits 0; the
    relative-link script fails on it (`MISS .claude/skills/ticket-plan/SKILL.md ->
    guard-probes.md`, exit 1).
  - Spec — accepted, fixed in S15.2 — `guard-probes.md` named "the template's **Probes** shape"
    with no template beside it; it names `docs/tickets/_template/plan.md`.
  - Implementer — accepted, fixed in S15.2 and S15.3 — "Standards and Spec alone, as does any step
    that is not a behaviour step" contradicted step 3's hunt; a move keeps Standards and Spec
    alone, any other non-behaviour step gets no `simplify` and no Design pass, and the hunt's
    trigger skips a move.
  - Spec — accepted, fixed in S15.3 — S15.2's wording opened a move that renames a test fake to
    the hunt, against S7's decision.
  - Standards — rejected: `.claude/CLAUDE.md` keeps the line `sdd.md` repeats, since `sdd.md`
    does not load for a code change outside a ticket — the owner rule asks for one home.
  - Standards — rejected: "gets no `simplify` and no Design pass" names what such a step loses; a
    positive list would restate the hunt's trigger — prompt the positive.

#### S16 — The second verification's lessons

- **Delivers:** the implementer leaves a Verify line that names a researcher to the main session;
  before changing a rule's wording, it greps the old phrase and edits every copy in the round; the
  plan-time Red run plants, once, the break each check is meant to catch, and the plan fixes every
  check that still passes.
- **Goal:** `verification.md` run 2 › Lessons L1–L3; L2 also the Problem's L4.
- **Blocked by:** S15, which edits `ticket-plan`.
- **Files:**
  - `.claude/agents/implementer.md`, Disciplines: L1's and L3's lines.
  - `.claude/skills/ticket-plan/SKILL.md`, step 4: L2's line.
  - `docs/tickets/2026-11-04-1009_toolkit-quality/verification.md`: run 2's L1–L3 **Applied:**
    read `yes, S16`.
- **Size:** ~20.
- **Test first:** A brief as the skill writes it — today no agent file leaves a researcher's
  check to the main session, and step 4's Red run never plants a break.
- **Verify:**
  - `grep -c 'Applied:\*\* yes, S16' docs/tickets/2026-11-04-1009_toolkit-quality/verification.md`
    — 3.
  - `make check` green.
- **Model:** `opus high`; run on `opus medium`
- **Status:** done
- **Findings:** passes that ran: Standards (sonnet, with writing-for-agents) and Spec on S16.1;
  S16.2 checked by the main session against its finding. No `simplify`, Design or hunt, an
  instruction-only step. Implementer 3.4 and 1.4 min on `opus medium`. The Test first was read by
  hand: a grep of the two files, no hit before, the lines after. `architecture.md` › Contracts ›
  the plan-time run's **Red** gains the planted run, by the main session.
  - Spec — accepted, fixed in S16.2 — a planted run on a copy without its own git repository
    cannot run a git-aware check (confirmed by a researcher: in a `git archive` export `make
    doc-lint` printed `fatal: not a git repository` and exited 2 without linting; in a `git clone
    --local` the plant failed on its own line, `missing-path`, and the reverted plant exited 0).
    The skill names the clone, and `catches` needs the output to name the break.
  - Spec — rejected: `researcher.md` gives experiments a temp directory outside the working tree
    (refuted by a researcher) — the step-4 researcher has nowhere allowed to plant.
  - Implementer — accepted, fixed by the main session — `architecture.md`'s Red contract listed
    only `fails as expected`, `passes` and `cannot run`.

#### S17 — The reviewer reads through Read

- **Delivers:** a `PreToolUse` hook on the `reviewer` agent's `Bash` refuses `cat`, `head`, `tail`
  and `sed -n` on a tracked file, naming `Read`; `git diff`, `git show` and every other command
  pass (D11).
- **Goal:** `verification.md` run 2 › L4; R5's `path:line`.
- **Blocked by:** none.
- **Files:**
  - `.claude/agents/reviewer.md`, frontmatter: the hook.
  - `.claude/hooks/`: the hook's script, beside `bash-guard.sh`.
  - `docs/knowledge/sdd.md`: the dependency map's hook row.
  - `docs/tickets/2026-11-04-1009_toolkit-quality/verification.md`: run 2's L4 **Applied:** reads
    `yes, S17`.
- **Size:** ~50.
- **Test first:** A hook fed a `PreToolUse` input — `cat -n
  application/chat/services/attachment.service.ts` passes today.
- **Verify:**
  - Probes, one per refused form, each fed to the script as a `PreToolUse` input: `cat -n`,
    `head -n 40`, `tail -n 40`, `sed -n '1,40p'` on a tracked file — each refused with a message
    naming `Read`; controls `git diff HEAD`, `git show HEAD:<file>`, `cat` of a file no git
    repository tracks — each passes.
  - `make check` green.
- **Model:** `opus high`
- **Status:** done
- **Findings:** passes that ran: `simplify` on S17.1; Standards (sonnet, with writing-for-agents
  on S17.1 and S17.2), Spec, Design and the hunt on S17.1, S17.2 and S17.3. Implementer 4.5, 3.8
  and 2.1 min on `opus high`, then 1.4 min for S17.3's header. The Test first and Verify ran from
  one script, 29 probes fed as `PreToolUse` inputs: before S17.1 all passed; after S17.3, "29 of
  29 `ok`", and `make check` exit 0. Live: the S17.1 Spec reviewer's own `cat -n
  .claude/hooks/make-check.sh` was refused by `PreToolUse:Bash`.
  - simplify — accepted, applied by the main session in S17.1 — the implementer's own tokenizer
    (52 lines) cut to `bash-guard.sh`'s idiom (23 lines). Skipped: a shared hook library, an `sh`
    pre-filter before `bun`, refusing every file, `nl` and `awk`. The cut lost the quoted path
    and the `cd`, which the hunt then showed.
  - hunt — accepted, fixed in S17.2 — a quoted path, a relative path after `cd`, a file in a
    worktree under the gitignored `.claude/worktrees` (each shown), and a cwd outside the repo
    (confirmed by a researcher; a missing `git` refuted: the `|| reason=` line refuses it).
  - Standards and Spec — accepted, fixed in S17.2 — the `/ticket-verify` row of the dependency
    map lacked the hook its `reviewer` carries.
  - Spec — accepted, fixed by the main session — the Test first named an untracked path, so it
    could not fail.
  - Design — rejected — refuse `cat` on every file, which drops the `git ls-files` check:
    contradicts D11's "a tracked file" and this Verify's control; offered to the user as a
    simplification. Register `bash-guard.sh` on the reviewer: it also refuses redirects into a
    file.
  - Spec — accepted as is — S17.2 refuses a file another repository tracks, since a finding
    cites the line `Read` shows wherever the file lives; the control reads "no git repository".
  - hunt — accepted, fixed in S17.3 — `cd -P`, a `cd` in a subshell or `$(…)`, `cd -`, a failed
    `cd` before `;`, each shown: every folder the command may be in now counts.
  - Spec and hunt — accepted as is, named in the header in S17.3 — the over-refusal after a `cd`
    elsewhere, one `Read`; the header's "a folder that does not exist names no file" reworded.
  - Design — rejected — one command parser shared with `bash-guard.sh` (a third guard pays for
    it), a pure `reads()` function, the `cd` line split in two, one `git` per folder.
  - Standards — rejected — the header narrates the code: `bash-guard.sh`'s header does the same.

#### S18 — One script for a repeated check

- **Delivers:** `/ticket-plan` step 3 asks a Verify that repeats one check over many inputs (a
  probe list, a count per file) to run them from one script the step names, not one tool call
  each, so the plan-time run and the step's Verify rerun the same set.
- **Goal:** R8's "the step's checks SHALL run the same probes after the change"; S13's cost: 89
  minutes for 180 probes, where the script's run took 34 s.
- **Blocked by:** S15, which moves step 3's probe definition into a sibling file.
- **Files:**
  - `.claude/skills/ticket-plan/SKILL.md`, step 3's **Verify**, or the sibling file S15 adds
    when the line belongs with the probes.
- **Size:** ~5.
- **Test first:** The plan-time run on a past plan — the no-op experiment of
  `.claude/agents/researcher.md` on the skill with and without the line, each asked for S13's
  Verify; today the answer does not name a script.
- **Verify:**
  - The experiment's two answers differ in whether the Verify names one script for the probes.
  - `make check` green.
- **Model:** `opus medium`
- **Status:** done
- **Findings:** passes that ran: Standards (sonnet, with writing-for-agents) and Spec on S18.1
  and S18.2; S18.3 checked by the main session against its finding. No `simplify`, Design or
  hunt, an instruction-only step. Implementer 3.5, 2.6 and 1.3 min on `opus medium`. The Test
  first ran as the no-op experiment on haiku, S13 without its Verify as the task: without the
  line, "seven bullets, one per kind of check… No script is named"; with it, the Verify opens
  with "`sh docs/tickets/x/run-probes.sh 8572da12bf > …`" and reruns it at the second commit.
  The S18.1 Standards brief left out `.claude/rules/commits.md` from `make review-rules`'s
  output (the main session's slip; no commit in the diff); S18.2's brief had it.
  - Standards — accepted, fixed in S18.2 — "the plan-time run" is the ticket's term, not the
    skill's.
  - Standards — rejected after the no-op experiment — cut "not one tool call per input": with
    the cut, haiku's Verify named no script and only "noted that the rule was not met"; with
    the ban, it named one.
  - Spec — accepted, fixed in S18.3 — "the Red run in step 4" misses the guard probes, which
    step 4's second `researcher` runs; and "the step's rerun" dropped "Verify". The line names
    step 4's run and the step's Verify.

#### S19 — Unclear when the repo cannot settle it

- **Delivers:** `researcher.md` gives `unclear` to a claim that only a new test or a run the repo
  cannot make (a production limit, a live service's behaviour) would settle, naming what is left
  open; a claim the evidence answers on other grounds stays `refuted` or `confirmed`.
- **Goal:** R6's `unclear` branch; S14's finding: the researcher named the trigger as unsettled
  and answered `refuted`.
- **Blocked by:** none.
- **Files:**
  - `.claude/agents/researcher.md`, the **A confirmation** bullet.
- **Size:** ~5.
- **Test first:** The replay of a committed step — the no-op experiment of `researcher.md` on the
  file with and without the line, its task S14's planted claim with a wrong outcome no
  requirement or installed default answers (the user sees a lost title, not a 500); today the
  verdict is `refuted`.
- **Verify:**
  - The experiment's two answers differ in the verdict: `unclear` with the line, naming what is
    left open.
  - `make check` green.
- **Model:** `opus medium`
- **Status:** done
- **Findings:** passes that ran: Standards (sonnet, with writing-for-agents) and Spec on S19.1;
  S19.2 checked by the main session against its finding and the experiment's rerun. No
  `simplify`, Design or hunt, an instruction-only step. Implementer 5.0 and 2.2 min on `opus
  medium`. The Test first ran as the no-op experiment on haiku, 3 runs a side, S14's planted
  claim with a lost title as the wrong outcome: without the line "`Verdict: confirmed` in all 3
  runs"; with it "`Verdict: unclear` in all 3 runs, each naming what is left open"; after S19.2's
  cut, `unclear` 3/3 again. The baseline is `confirmed`, not the `refuted` this step expected:
  S14's `refuted` came from opus in the worktree; either way the old rule never reached
  `unclear`. A first pair whose task said "no test … sends a burst against real S3" gave
  `unclear` on both sides and was dropped, since it handed the reader the old rule's reason.
  - Standards — accepted, fixed in S19.2 — "naming what is left open" repeated the report
    format's "`unclear` names what could not be settled".
  - Standards — rejected — "stays `refuted` or `confirmed`" as a no-op: this step's Delivers
    asks for it.
  - Spec — refuted by the implementer's report — no experiment output; and the last clause
    letting S14's `refuted` stand: with the line, `unclear` 3/3.
  - Spec and Standards — accepted, fixed by the main session — D4's Cost accepted named only "a
    new test".

#### S20 — The model runs a ticket skill when asked

- **Delivers:** the five `/ticket-*` skills drop `disable-model-invocation: true`, and each
  description says it runs only when the user asks for that phase, so the main session runs a
  phase the user asked for in words (`run the verify yourself`) without the user typing it; the
  gates of `.claude/rules/sdd.md` (the commit gate, a push, a PR, a merge) still wait for the user.
- **Goal:** the user's request of 2026-11-04: the main session could not start `/ticket-verify`
  ("cannot be used with Skill tool due to disable-model-invocation") though the user asked it to.
  Reverses monorepo-setup's D29 "keeps side-effecting procedures under the user's control": the
  gates hold that control now.
- **Blocked by:** none.
- **Files:**
  - `.claude/skills/ticket-{feature,architecture,plan,implement,verify}/SKILL.md`, frontmatter.
  - `docs/knowledge/sdd.md` › The five skills: who starts them.
- **Size:** ~15.
- **Test first:** none runs in-session: the Skill tool's refusal is the red state, quoted in Goal.
- **Verify:**
  - `git grep -n disable-model-invocation .claude/skills/ticket-*` prints nothing.
  - `make check` green.
  - After the commit, the main session calls the Skill tool with `ticket-verify` and it loads.
- **Model:** `opus medium`
- **Status:** done
- **Findings:** passes that ran: Standards (sonnet, with writing-for-agents) and Spec on S20.1;
  S20.2 checked by the main session against its two findings. No `simplify`, Design or hunt, a
  config step. Implementer 2.7 and 1.3 min on `opus medium`. Verify: the planted
  `ticket-probe/SKILL.md` printed its line, the real grep printed nothing (exit 1); the session's
  skill list now shows the five with "Run only when the user asks for this phase". The Skill
  call on `ticket-verify` runs after this commit, as the ticket's verification.
  - Standards — accepted, fixed in S20.2 — `sdd.md` said "the model never starts one on its
    own", which nothing enforces once the flag is gone.
  - Spec — accepted, fixed in S20.2 — "(a commit, a push, a PR, a merge) still wait for you":
    the commit gate may let a ready step commit without the user (the session's answer, a loop).
  - Standards — rejected — the five-word tail costs context in every session: no shorter wording
    carries the same guard.
  - Spec — rejected — `feature.md`'s Scope does not cover how the skills start: no requirement
    changes, and the user asked for the step.

#### S21 — The agent picks its own tools

- **Delivers:** no hook or instruction line refuses or steers which tool an agent reads, searches
  or edits with: `.claude/hooks/bash-guard.sh` and `.claude/hooks/read-guard.sh` are deleted with
  their `hooks:` entries; `reviewer.md` drops "Read each file with the `Read` tool, one per call"
  and keeps a finding's line as the file's own line number, never a position in a diff hunk;
  `implementer.md` states, in place of the hook line, which calls load a rule's `paths:` filter
  (below), so the agent knows it; `.claude/settings.json` allows `claude -p` (`git worktree` was
  allowed already), so a background agent runs the experiments its file describes, and asks only
  before a remote or the loss of uncommitted work (the user's addition). The read-only agents'
  `disallowedTools` and the implementer's `make-check.sh` stay: a role boundary and a gate, not a
  tool choice.
- **Goal:** the user's decision of 2026-11-04: "давай вообще уберем все, что связано с вот этой
  блокировкой клауды, ее возможностей". Measured on Claude Code 2.1.311 the same day:
  - a rule's `paths:` filter loads on `Read`, `Edit`, and a single-file `cat`, `head`, `sed -n`
    or a `grep` with a match; not on a pipe, `cd … &&`, two files or `sed -i`; a loaded rule
    stays for the session;
  - a fresh session in `bypassPermissions` has no `Grep` or `Glob` and gets the harness's
    Bash-first reminder, and read through Bash 16 of 16 times; in `acceptEdits` it read through
    `Read` 21 of 24 times; project instructions changed neither.
  Reverses D11.
- **Blocked by:** none.
- **Files:**
  - `.claude/hooks/`: the two guards; `make-check.sh` stays.
  - `.claude/agents/implementer.md`, `.claude/agents/reviewer.md`: frontmatter and the lines above.
  - `.claude/settings.json`: `permissions.allow` gains `claude -p` and `git rebase`;
    `permissions.ask` keeps push, PR create and merge, repo create, `gh api`, `reset --hard`,
    `clean` and `stash clear`; `deny` unchanged.
  - `docs/knowledge/sdd.md`: the dependency map's hook cells and diagram nodes.
  - `docs/tickets/2026-11-04-1009_toolkit-quality/feature.md` › Scope: a line for S20 and S21.
- **Size:** ~120, most of it deleted.
- **Test first:** A hook fed a `PreToolUse` input — `cat -n
  application/chat/services/attachment.service.ts` fed to `read-guard.sh` exits 2 today.
- **Verify:**
  - `git grep -n -e bash-guard -e read-guard -- .claude docs/knowledge` prints nothing; `ls
    .claude/hooks` lists only `make-check.sh`.
  - `make check` green.
  - After the commit, a spawned `reviewer` runs `cat -n` on a tracked file and is not refused
    (the main session).
- **Model:** `opus medium`
- **Status:** done
- **Findings:** passes that ran: Standards (sonnet, with writing-for-agents) and Spec on S21.1;
  S21.2 checked by the main session against its two findings. No `simplify`, Design or hunt, a
  config step. Implementer on `opus medium`, about 5 and 1.5 min. Verify: the planted
  `.claude/probe.txt` printed `.claude/probe.txt:1:bash-guard`, the real grep printed nothing
  (exit 1); `ls .claude/hooks` → `make-check.sh`; `make check` exit 0 (221 unit, 104 e2e); a
  spawned `reviewer` ran `cat -n application/chat/services/attachment.service.ts`, with and
  without `| head -5`, and neither was refused (its first line is line 1, `import {`).
  - Spec — accepted, fixed in S21.2 — bash-guard's `git checkout`/`git restore` refusal kept a
    probe from wiping uncommitted work and chose no tool; it is a line in `implementer.md` now.
  - Standards — accepted, fixed in S21.2 — `reviewer.md:66`: `enforces.` sat alone after the
    reflow.
  - Spec — accepted, fixed at the commit — `architecture.md`'s Seam row "A hook fed a
    `PreToolUse` input" and D11 still read as holding: the row is marked retired, D11 reversed
    by D13; D12 records S20's reversal of monorepo-setup's D29, missed when S20 committed.
  - Spec — accepted, fixed at the commit — the `permissions` changes went beyond Files: Delivers
    and Files name them now.
  - Standards — rejected — trim `implementer.md`'s list of the reads that load a rule to one
    clause: the list (a pipe or `cd … &&` loads none) is what the agent cannot find by looking.

#### S22 — The gate refuses a tree it cannot find

- **Delivers:** when the implementer's stop input names a `cwd` git cannot resolve,
  `make-check.sh` refuses to let it finish and says why, as its own comment intends; today
  `git -C` prints nothing, `cd ""` succeeds, and `make check` runs in whatever folder the hook
  started in, so a worktree implementer can pass on the main tree's state.
- **Goal:** the gate checks the agent's own tree or none (D13 keeps `make-check.sh` as the gate).
- **Blocked by:** none.
- **Files:** `.claude/hooks/make-check.sh`, the `cd "$dir"` branch.
- **Size:** ~3.
- **Test first:** A toolkit script fed its input — `sh <ticket>/hook-cases.sh cwd-missing` prints
  `FAIL cwd-missing: exit 0 (expected 2)` today.
- **Verify:**
  - `sh docs/tickets/2026-11-04-1009_toolkit-quality/hook-cases.sh cwd-missing red green blocked`
    prints four `PASS` lines; fails while `cwd-missing` exits 0.
  - `make check` green.
- **Model:** `opus medium`
- **Status:** todo

#### S23 — A `BLOCKED:` in Markdown emphasis lets the implementer stop

- **Delivers:** a final message that opens with `BLOCKED:` set in Markdown emphasis (`**BLOCKED:**`)
  lets the implementer stop like a plain one; a `BLOCKED:` later in the message still does not.
  Today the hook sends such a message back, and Claude Code ends the loop only after eight blocks
  in a row with no tool call between them.
- **Goal:** `BLOCKED:` stays the one way out of a red gate, however the model formats it.
- **Blocked by:** S22 (the same file).
- **Files:** `.claude/hooks/make-check.sh`, the prefix read; `.claude/agents/implementer.md` only
  if its `BLOCKED:` line must change.
- **Size:** ~3.
- **Test first:** A toolkit script fed its input — `sh <ticket>/hook-cases.sh blocked-bold` prints
  `FAIL blocked-bold: exit 2 (expected 0)` today.
- **Verify:**
  - `sh docs/tickets/2026-11-04-1009_toolkit-quality/hook-cases.sh` prints six `PASS` lines and
    exits 0; fails while `blocked-bold` exits 2 or `blocked-mid` exits 0.
  - `make check` green.
- **Model:** `opus medium`
- **Status:** todo

#### S24 — `rm -rf` is not denied

- **Delivers:** `.claude/settings.json` no longer denies `rm -rf`, so an agent cleans its scratch
  folders without stopping; the deny never protected anything, since `rm -fr` and `rm -r -f` pass
  it (run on 2026-11-05). The other denies stay: `sudo`, and `npm`, `yarn`, `pnpm` for the
  bun-only rule.
- **Goal:** run 3's L4 (an agent stopped at the deny, +9 min, folders left), closed by removing the
  cause instead of a line in two agents; D13's "no hook or instruction line steers which tool".
- **Blocked by:** none.
- **Files:** `.claude/settings.json` › `permissions.deny`; `docs/knowledge/roadmap.md` › The
  toolkit after `toolkit-quality`, L4's line.
- **Size:** ~4.
- **Test first:** `config only`.
- **Verify:**
  - `jq -e '[.permissions.deny[] | select(startswith("Bash(rm"))] | length == 0'
    .claude/settings.json` prints `true`; prints `false` while a `rm` deny stays.
  - `git grep -n 'rm -rf' -- .claude docs/knowledge` prints nothing; today it prints
    `settings.json:109` and the roadmap's line for L4's fix (`roadmap.md:775`), and it stays red
    until both change.
  - `make check` green.
- **Model:** `opus medium`
- **Status:** done
- **Findings:** passes that ran: Standards (sonnet) and Spec on S24.1; S24.2 checked by the main
  session against its finding. No `simplify`, Design or hunt, a config step. Implementer on
  `opus medium` in the worktree `toolkit-quality-S24-rm-deny` (N=4), about 2.7 and 1.4 min.
  Verify: the `jq` check printed `false` before and `true` after; the `git grep` printed
  `.claude/settings.json:109` and `docs/knowledge/roadmap.md:775` before and nothing after
  (exit 1); `make check` exit 0. Rounds S24.1 and S24.2 land as one commit, on the user's word.
  - Spec — accepted, fixed in S24.2 — `roadmap.md:775` sat in the list of what run 3 left open
    while it described S24's change as done; the bullet goes and the list names L1–L3.
  - Implementer — rejected — add "L4 later closed by S24" to run 3's `verification.md:361`: it
    is the record of that run.

#### S25 — `make worktree` refuses a number in use

- **Delivers:** `make worktree N=<n> NAME=<name>` refuses an `N` that another live worktree's
  `.env` already holds as its stage, an `N` whose highest port would pass 65535 (`RDS_BASE_PORT`,
  `15432 + 10 × N`, so `N` above 5010; the four ports end in 0, 1, 6 and 2, so no two of any `N`
  meet), and a worktree already set up under another `N`, whose containers would be left
  running; a rerun with its own `N` still passes. Today all three pass and rewrite the ports.
- **Goal:** each worktree keeps its own ports and containers (`docs/knowledge/tooling.md ›
  Worktrees`), checked by the script rather than by the main session's count.
- **Blocked by:** none.
- **Files:** `.claude/skills/ticket-implement/worktree.sh`, its checks before the draft `.env`;
  `docs/knowledge/tooling.md › Worktrees` if it states the limits.
- **Size:** ~15.
- **Test first:** A toolkit script fed its input — `sh <ticket>/worktree-cases.sh` prints `FAIL`
  for `n-taken`, `n-too-big` and `n-renumber` today.
- **Verify:**
  - `sh docs/tickets/2026-11-04-1009_toolkit-quality/worktree-cases.sh` prints six `PASS` lines
    and exits 0; fails while any of the three refusals passes.
  - `make check` green.
- **Model:** `opus medium`
- **Status:** todo

#### S26 — No line names a read or search tool

- **Delivers:** the lines D13 missed state what an agent reads, not which tool reads it:
  `implementer.md`'s "Read the step" (`grep -n` and offset) and "Find code through the `LSP`
  tool", `reviewer.md`'s anchored parts (`grep -n` and offset), and `/ticket-implement` step 1's
  read of `plan.md` (`grep -n` and offset). What each line bounds (only the step's section, only
  the anchored part, every use of a renamed symbol) stays.
- **Goal:** D13: no hook or instruction line steers which tool an agent reads, searches or edits
  with.
- **Blocked by:** none.
- **Files:** `.claude/agents/implementer.md`, `.claude/agents/reviewer.md`,
  `.claude/skills/ticket-implement/SKILL.md`; `docs/knowledge/sdd.md` if it repeats them.
- **Size:** ~15.
- **Test first:** `make check` over the edited skills, agents and templates — the grep below
  prints five lines today (`SKILL.md`'s read spans lines 15 and 16).
- **Verify:**
  - `git grep -n -E 'grep -n|with offset|and offset|through the .LSP' -- .claude/agents
    .claude/skills` prints nothing; fails while any of the four lines stays.
  - `make check` green.
- **Model:** `opus medium`
- **Status:** todo

#### S27 — An agent's worktree branches from the ticket branch

- **Delivers:** `.claude/settings.json` sets `worktree.baseRef` to `"head"`, so an implementer
  spawned with `isolation: "worktree"` starts from the ticket branch on any machine. Claude Code
  branches such a worktree from `origin/HEAD` by default
  ([worktrees › Choose the base branch](https://code.claude.com/docs/en/worktrees#choose-the-base-branch));
  it works today only because the user's own settings set the key.
- **Goal:** parallel steps (`parallel-steps.md`) start from the steps already committed.
- **Blocked by:** S24 (the same file).
- **Files:** `.claude/settings.json`; `docs/knowledge/tooling.md › Worktrees` or
  `parallel-steps.md`, wherever the base belongs.
- **Size:** ~5.
- **Test first:** `config only`.
- **Verify:**
  - `jq -e '.worktree.baseRef == "head"' .claude/settings.json` prints `true`; prints `false`
    today.
  - Not settled by a check: that Claude Code reads the key from project settings as from the
    user's (the docs say "settings"); seeing it needs a machine without the user's key.
  - `make check` green.
- **Model:** `opus medium`
- **Status:** todo

## Requirement coverage

| Req | Steps |
|---|---|
| R1 | S2, S7; observed in S5, S6 |
| R2 | S2; observed in S5 |
| R3 | S2; observed in S5 |
| R4 | S1, S9; observed in S5, S9 |
| R5 | S1; observed in S5; S17 |
| R6 | S1; observed in S5; S14, S19 |
| R7 | S3; observed in S6; S16 |
| R8 | S3, S8; observed in S6, S8; S13, S18 |
| R9 | S4; observed in S6 |
| R10 | S4 |
| R11 | S5, S6, S9 |
| R12 | S1; filled by this ticket's `/ticket-verify` |
| R13 | S12 |
