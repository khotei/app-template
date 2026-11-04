# Toolkit quality

> Ticket: `2026-11-04-1009_toolkit-quality` · Source:
> [roadmap entry 25 `toolkit-quality`](../../knowledge/roadmap.md#25-toolkit-quality) and the
> grilling of 2026-11-04
> Related: [architecture.md](./architecture.md) · [plan.md](./plan.md)

## Problem

A step's review finds what breaks a rule or the spec, but rarely what makes the code hard to
change: the shape pass looks at one thing, the width of an interface. The bug hunt has one line of
brief, so a fallback that hides a failure passes unless the reviewer happens to look. A plan's
checks are written to fail, but nobody runs them before the step: in `modular-monolith` a check
that could not fail surfaced in five steps, and a rewritten guard lost three of its bans with no
failing check, which cost a failed verification and two fix steps. A bug ticket starts from
requirements, not from a command that shows the bug.

## Goal

The review of a behaviour step proposes concrete design changes, each shown as code before and
after; every behaviour finding carries the failure it predicts, and a claimed failure is
confirmed before it reaches the user. Every check a plan names is seen to fail before its step
runs. A bug ticket starts from a red reproduction. The ticket records what the new review finds
and how long it takes, so the user can judge each pass on outcome and time.

## Context

- **The review today** (checked 2026-11-03): on a behaviour step the main session runs `simplify`,
  then parallel `reviewer` passes Standards, Spec and Depth (module shape in the vocabulary of
  `codebase-design`); the hunt (correctness bugs and silent failures) runs on risky steps only.
  No pass asks for missing tests. The reviewer runs on opus at medium effort, Standards on sonnet.
- **The plan's checks today:** `/ticket-plan` asks each Verify check to name the state it fails
  on; the implementer runs each Verify grep or probe against a planted hit at step time. Nobody
  runs them at plan time. Lessons that asked for it and were never applied:
  `architecture-audit` L1, `modular-monolith` L4 (five steps) and L8 (a guard rewrite lost the
  bans of `apps/*`, `deployment` and the domain tests' override).
- **Current practice** (research of 2026-11-04):
  - Design remarks are the least acted-on class of AI review comments: in Atlassian's study of
    4,000 comments, 28.6% of design comments were followed by a fix, against 41.9% for bugs
    ([arXiv 2510.05450](https://arxiv.org/html/2510.05450v1)). Anthropic advises capping low
    severity findings ("at most five nits per review") and notes that current models over-build
    abstractions.
  - Anthropic's managed Code Review finds, then verifies each candidate against the code, then
    ranks; Cursor's Bugbot raised its resolution rate from 52% to over 70% with a validation pass.
    Anthropic asks behaviour claims to cite `file:line`, not infer from names.
  - Anthropic's guidance for Opus 5: accuracy holds at lower effort; asking a reviewer to "be
    conservative" makes it report less, so filtering belongs after the report.
  - Reproduce first is Anthropic's own example prompt ("write a failing test that reproduces it,
    then fix it"); a planted probe is a hand-made mutant, as in Meta's mutation-guided testing.
- **Lint checks' catches** (agent session transcripts, 2026-11-02 18:35 to 2026-11-03, about 34
  hours): doc line width about 17; missing paths in docs 2; instruction-file checks 1; Effect
  style rules 0 since they moved into Biome; import bans 0 (probes only); the web bundle check 0,
  its pattern rewritten six times after renames. The window is too short to call a zero-catch
  check useless.
- **Plugin skills used:** `mattpocock-skills:writing-for-agents` is a list of levers, not an
  executable test; its no-op test asks whether a line changes behaviour against the default.
  `mattpocock-skills:diagnosing-bugs` phase 1 builds one red-capable command that shows the
  user's exact symptom, phase 2 minimises it.

## Scope

- A design pass replaces the shape pass on behaviour steps, with its examples file.
- The hunt's questions on error-absorbing constructs and the confirmation of claimed failures.
- The failure scenario on every behaviour finding.
- Plan-time runs of each step's checks, and probes for guards a step changes or removes.
- The writing-for-agents guidance in the Standards pass of instruction edits.
- The reproduction-first start of a bug ticket.
- A record of each review pass's outcome and time: a replay under the new toolkit and a per-pass
  ledger in each later verification.
- A loop mode of `/ticket-implement` that takes a plan's steps to commits one after another.
- Every current check of `make check` is kept; the roadmap notes to re-count the zero-catch ones
  after three or four tickets.

## Out of scope

- Rewriting the web bundle check: `client-publishing` keys it on package names once the web
  reaches the server only through the API contract.
- A baseline replay under the old toolkit or a pass/fail threshold: the user judges the recorded
  outcome and time.
- A design pass split into two narrower passes; import direction as a design lens (Biome's import
  bans own it).
- Loading `writing-for-agents` in the implementer.
- A plugin agent that runs unasked, edits code, writes outside `docs/tickets/` or filters findings
  by a confidence score; a second artifact store.

## Requirements

### Design pass

- **R1** — WHEN a step changes behaviour, THE review SHALL run a design pass in place of the
  module-shape pass that looks for a narrower interface, composition in place of a wrapper per
  case, a pure function taken out of an effect, and a shorter or plainer implementation, judging
  each candidate by cohesion (what changes together lives together) and coupling (a module knows
  of another only its contract).
- **R2** — THE design pass SHALL report at most five candidates per step, each with a before →
  after code sketch and a strength of `Strong`, `Worth exploring` or `Speculative`.
- **R3** — THE design pass SHALL read do and don't examples written on a neutral entity, which
  only it reads and which point to the existing rule examples and recorded architecture decisions
  instead of copying them.

### Hunt and findings

- **R4** — WHEN the hunt reviews a step, THE hunt SHALL ask of each construct that absorbs an
  error (a catch-all, a fallback, an ignore, a default for an absent value, a retry, an error
  folded into a refusal, a discarded result) which failure it hides and who learns of it.
- **R5** — THE review SHALL report a finding about behaviour, a missing test included, only with
  its failure scenario (an input and the wrong outcome) and the code location it rests on.
- **R6** — IF a finding claims a runtime failure it does not show, THEN THE main session SHALL have
  a researcher confirm it before it reaches the user, the confirmations running in parallel and
  each answering confirmed, refuted or unclear; an unclear one SHALL reach the user as a question.

### Plan checks

- **R7** — WHEN a plan is prepared, THE SYSTEM SHALL run each check for new work once on the tree
  as it stands before the plan is presented, and fix in the plan any check that passes there or
  cannot run as written.
- **R8** — WHERE a step adds, changes or removes a guard or a scope of one, THE plan SHALL hold
  one probe per ban of each scope the step adds, changes or removes, of every scope whose files
  those also match, and of every scope when it rewrites the guard whole, each shown failing the
  guard at plan time except an added scope's own, which fails after the change, and the step's
  checks SHALL run the same probes after the change.

### Instruction edits and bug tickets

- **R9** — WHERE a step edits an instruction file, THE Standards pass SHALL also judge it by the
  writing-for-agents guidance, settle a dispute over whether a line changes behaviour by running
  it, and follow the project's instruction rule where the two disagree.
- **R10** — WHEN a bug ticket starts, THE SYSTEM SHALL first produce one command that shows the
  user's exact symptom failing and minimise it, or name the existing failing check that already
  shows it, copy its failing output into the ticket, and use it as the acceptance check of the
  bug's requirement.

### Outcome and time

- **R11** — WHEN the toolkit changes land, THE ticket SHALL record, for a replay of committed steps
  under the new toolkit with the reviewer at low effort, each pass's findings and wall time: the
  design pass on three behaviour steps whose problems were found later, the hunt on two steps
  where an error was swallowed, and the plan-time check run on a past plan with checks known to be
  broken.
- **R12** — WHEN a ticket is verified, THE verification SHALL record per review pass how many of
  its findings across the steps were accepted, rejected and fixed.

### Loop

- **R13** — WHERE the user starts `/ticket-implement` in loop mode, THE main session SHALL take
  each unblocked `todo` step in turn to a commit without the user's OK between steps, and SHALL
  stop at a `BLOCKED:` report, a finding the user must decide, a step not ready after three fix
  rounds, the user's word to stop, or when no unblocked `todo` step remains.

## Acceptance

| Req | How to verify |
|---|---|
| R1 | the replay of R11: the design pass's report on a behaviour step holds candidates of the listed kinds and none on import direction; a move-only step gets no design pass |
| R2 | the same reports: no step has more than five candidates; each has a before and an after sketch and a strength |
| R3 | the design pass's brief links the examples file; the file's examples use a neutral entity, and grep finds no example copied from the rules |
| R4 | the hunt's report on a replayed step with a swallowed error names that construct and the failure it hides |
| R5 | every behaviour finding in the replay's reports has an input → wrong outcome and a `path:line`; a planted finding without one is not reported |
| R6 | a replayed finding that claims an unshown failure gets a researcher verdict of confirmed, refuted or unclear before it is presented; an unclear one is asked |
| R7 | the plan-time run on the past plan reports each check that passes on the tree as it stands or fails to run |
| R8 | a plan for a step that adds, changes or removes a guard or a scope of one lists one probe per ban of the scopes `/ticket-plan` step 3 names, each with its plan-time output, failing except an added scope's own; the step's Verify runs them |
| R9 | the Standards brief of an instruction-editing step names the writing-for-agents guidance; an implementer brief does not |
| R10 | the bug-ticket start of `/ticket-feature` asks for the red command or the existing failing check and its output before requirements |
| R11 | the ticket holds a table of pass → step → findings → wall time for the replays |
| R12 | the verification template has the per-pass ledger, and this ticket's verification fills it |
| R13 | a no-op run on the skill with and without the loop lines, both started with `loop`, on two cases: a step not ready after three fix rounds, and the loop's first step; the answers differ in whether the session asks the commit question and in whether it sends a fourth fix round or stops the loop |

## Open questions

### Q1 — Which committed steps does the replay use?

- **Why it matters:** R11's numbers mean something only on steps whose problems are known.
- **Options:** A — a researcher picks them from fix rounds, verification findings and bug
  commits, and the user confirms the list; B — the user names them.
- **Recommendation:** A, at `/ticket-architecture`.
- **Answer:** A: a researcher picked the steps from later fixes; the set is in [architecture.md › Contracts](./architecture.md#contracts), run as [D8](./architecture.md#decisions).

### Q2 — Where does the per-pass ledger get its counts?

- **Why it matters:** R12 needs each finding's pass and fate recorded per step, which `plan.md`
  findings may not hold today.
- **Options:** A — each step's findings in `plan.md` carry their pass and fate, and the verifier
  sums them; B — the verifier rebuilds them from the step commits' bodies.
- **Recommendation:** A, decided at `/ticket-architecture`.
- **Answer:** A, as [D9](./architecture.md#decisions); `/ticket-verify`'s main session sums them, since a verifier never reads `plan.md`.
