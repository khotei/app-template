# Lean instructions

> Ticket: `2026-11-02-1820_lean-instructions` · Source: conversation (the branch review of
> 2026-11-02: the md audit and the context research); absorbs
> [roadmap entry 17 `docs-diet`](../../knowledge/roadmap.md#17-docs-diet)
> Related: [architecture.md](./architecture.md) · [plan.md](./plan.md) · [research.md](./research.md)

## Problem

The instruction files Claude reads (the project and layer `CLAUDE.md` files, the rules, the skills
and the agents) and the docs people read name live paths, lists of files, counts and versions.
Every move or rename of code then forces a doc edit, and a stale name slips through wherever no
check reads: on the `modular-monolith` branch every `CLAUDE.md` edit was a path rename, never a
changed constraint. A rule whose path filter stops matching after a rename stops loading, and
nothing says so. Each session also pays for instructions it does not need: editing one `.ts` file
of a module loads about 9.6k tokens of rules, every step's reviewer reads the ticket's whole
`architecture.md` and every rule, and `/ticket-implement` loads its rarely used parallel-steps
procedure on every step. The commit gate is told in ten files and no longer matches how steps are
committed. In the agents' runs, review passes overlap, the Spec reviewer flags what only the main
session may write, the implementer runs `/simplify` on its own edits, the verifier reads the
whole plan twice, and every agent writes its report in the user's style for a reader that is
the main session.

## Goal

The instruction files hold the pattern and the why and point to the one file that owns each fact,
so a refactor that keeps every constraint needs no doc edit, while Claude is guided at least as
well as today. `make check` refuses the kinds of drift that recurred, so the files stay this way in
later sessions without anyone re-auditing them. Each measured lever cuts at least 20% of the load
it targets.

## Context

- **How instructions load** (the context research, 2026-11-02): the root `CLAUDE.md` and every rule
  without `paths:` load at session start; a nested `CLAUDE.md` and a path-scoped rule load when
  Claude reads, writes or edits a matching file, and are not kept after compaction; an `@import`
  loads eagerly; HTML comments are stripped; a skill with `disable-model-invocation` costs nothing
  until invoked. The `InstructionsLoaded` hook logs each file that loads and why.
- **The official docs** (the docs research, 2026-11-02, Claude Code 2.1.309): a path-scoped rule
  is summarized away by compaction and reloads on the next matching file; a subagent loads the
  `CLAUDE.md` hierarchy and the unscoped rules at its start and the path-scoped ones on its own
  file access; a hook's `additionalContext` arrives next to the tool result, so nothing reaches
  Claude before a `Write`; a skill may keep supporting files it reads on demand. Anthropic
  advises against emphasis markers, which make current models over-apply a rule: a rule that
  cannot bend becomes a check or a hook.
- **Measured load** (2026-11-02, a tokenizer and an `InstructionsLoaded` run): about 1.0k tokens at
  session start; editing a `.ts` file of a module adds about 9.6k, the same set whatever its
  layer, so a services file read after a domain file loads nothing more. One `/ticket-implement`
  step costs about 33k across its three contexts, and the reviewers of a behaviour step about 46k
  (not re-measured). Files loaded together repeat each other for only about 3%.
- **The levers that pass the 20% threshold** the user set for a cut made for tokens alone:
  - the step reviewer reads only the parts of the ticket's `architecture.md` the step cites: about
    5k per reviewer, 33% of its load; the Standards reviewer reads only the rules whose filters
    match the diff, where today it reads all of them (about 10k);
  - the implementer stops reading every rule at the start of a step, since a path-scoped rule
    arrives on its own: about 3.7k, 24%;
  - the rules that load on any `.ts` of a module, trimmed by the audit's findings (default Effect
    style Claude writes unprompted, a file table that retells `ls`, two rules on one subject):
    about 30% of that load, by the fresh audit's estimate;
  - `/ticket-implement` keeps its parallel-steps procedure in a file it reads only for parallel
    steps: about 45% of the skill's 2.5k.
- **How the agents spend their runs** (234 agent runs of `modular-monolith`, 2026-11-02): a step's
  time is the implementer's (median 17 min); the reviews run in parallel for 2–3 min and no
  agent compacted. Depth changed a step's shape in 5 of 5 sampled steps; Spec caught real
  regressions but flagged an unrecorded `plan.md` deviation in 11 of 47 reports, which only the
  main session may write; Standards' judgement calls repeated Depth's in 3 of 5; the bug hunt
  found a real bug once in 12 runs (Spec found it too), the silent-failure hunter none in 3; the
  implementer ran `/simplify` itself in 36 of 50 runs and once deleted a needed function; the
  verifier (33 min) read the 2,000-line `plan.md` twice; 38 of 42 implementer reports carried
  the user's Russian status block. The main session itself ran 1,542 turns with 14 compactions
  and peaked at 530k tokens, largely reading diffs and code (967 shell calls) to write the fix
  rounds the reviewers' `path:line` findings already located; verification waits on one
  verifier over every requirement.
- **Where the churn sits** (the md audit, commits since the branch base): `architecture.md` 29,
  `tooling.md` 21, `naming.md` 20, `database.md` 19, `README.md` 12, `effect-tests.md` 10, the root
  `CLAUDE.md` 9, `kernel/CLAUDE.md` 8 of its 8. Facts told in several places: the rings and which
  folder holds what (5 places), versions (4), the test layout, the resource naming, the
  dependency command, the worktree ports, the database's guards, the data layer's types rule, and
  the commit gate (ten files: the SDD rule, the commit and PR rules, the five skills, the
  implementer).
- **What checks today:** `make doc-names` fails on a backticked path or name the repo lacks, but
  reads only the `CLAUDE.md` files, the rules and `docs/knowledge/`, not the skills, the agents
  or any `README.md`. `make doc-width` holds lines to 100 columns. The size limits of
  `claude-md.md` (about 40 lines for a `CLAUDE.md`, about 80 for a rule) are checked by nothing,
  and four rules sit at or over 80 lines.
- **The maintenance rule exists:** `claude-md.md` already states the test a line must pass, one
  author per fact and the pattern over the instance; this ticket makes its parts checkable.
- **Where it lands:** on its own branch off `modular-monolith`, its PR into that branch, after
  that ticket's last step, so the texts are written against the code in its final shape. The
  audit's draft texts were written before that ticket's last steps and serve as a model, not as
  text to paste.
- **The ticket artifacts churn the same way** ([research.md](./research.md), 2026-11-02): of the
  47 commits that touched `modular-monolith`'s three artifacts after its plan, most that did more
  than add findings or steps fixed a step's file list, a restated config or a path in an
  acceptance row (12 of 13 `feature.md` commits), and one changed what a requirement asks. The
  implementer found every file a list missed by `git grep`; what it needed concretely were
  decided names, traps the code cannot show and checks proven red first.

## Scope

- Every Markdown file outside `docs/tickets/`: the instruction files Claude reads, the rules, the
  skills, the agents, the PR template, the `README.md` files and `docs/knowledge/`.
- Rewriting them to patterns and pointers; deleting lines that change nothing; adding the traps the
  audit found that the code cannot show.
- Three checks in `make check`: names across every doc (no concrete source path in an
  instruction file included), every path filter matching a file, the size limits.
- The four context levers and a before-and-after measurement.
- The commit gate stated once, its answer asked once per session.
- The agents' briefs and texts: what each reads, what it leaves to the main session, which review
  pass owns which finding, when the bug hunt runs, who runs `/simplify`; the main session as the
  orchestrator that decides on the agents' reports; verification fanned out over parallel
  verifiers.
- The ticket templates and the skills that write a ticket: what a requirement, a design entry and
  a step name concretely, and what they leave to a pattern, a grep or a check.
- The roadmap's `docs-diet` entry, absorbed.

## Out of scope

- The ticket folders and the roadmap's history, which record what was true then.
- A cut made for tokens alone that saves under 20% of the load it targets.
- A hook that runs on every edit, and a check of version literals: the docs say "the pinned
  version" and point to the manifest instead.
- Emphasis markers on rule lines (`**Required:**`, `IMPORTANT`): the docs advise against them; a
  costly trap is stated plainly and early in its file.
- Code changes, and the plugin skills, which are referenced by name and never edited.

## Requirements

### Text that survives a refactor

- **R1** — WHEN code is moved or renamed and no constraint changes, THE SYSTEM SHALL need no edit
  to any instruction file Claude reads.
- **R2** — THE SYSTEM SHALL state each fact in one file, its owner, and every other file that needs
  it SHALL point to the owner by name instead of retelling it.
- **R3** — WHERE a line of an instruction file would not change what Claude does in this project,
  because Claude gets it right from the code, the stack or the surrounding style, THE SYSTEM SHALL
  not carry that line.
- **R4** — WHERE a doc written for people names a live path, name, count, version or a list of
  what exists today, THE SYSTEM SHALL keep it only in the doc that owns that fact, and keep any
  other line only when a reader would go wrong or search long without it.
- **R5** — WHERE a trap is invisible in the code (an ordering, a version quirk, a constraint no
  type expresses) and the audit or the branch found Claude falling into it, THE SYSTEM SHALL state
  it in the instruction file of the layer where it bites.
- **R6** — THE SYSTEM SHALL hold no doc that only retells another doc or the files beside it.

### Checks that keep it so

- **R7** — IF any Markdown file outside the ticket folders, the skills, the agents and every
  `README.md` included, names in backticks a path or a name the repository lacks, THEN
  `make check` SHALL fail, naming the file and the line.
- **R8** — IF an instruction file Claude reads names a concrete path to a source file, rather
  than a pattern with placeholders or a pointer to a doc, THEN `make check` SHALL fail, naming
  the file and the line.
- **R9** — IF a rule's path filter matches no file in the repository, THEN `make check` SHALL
  fail, naming the rule and the filter.
- **R10** — IF a `CLAUDE.md` exceeds 40 lines or a rule exceeds 80 lines, THEN `make check` SHALL
  fail, naming the file and its length.
- **R11** — WHEN a later session writes or edits an instruction file, THE maintenance rule SHALL
  state the test a line must pass, the owner of each fact and the pattern over the instance, and
  name the checks of R7–R10 that enforce them.

### Less context per session

- **R12** — WHEN a reviewer reviews one plan step, THE SYSTEM SHALL have it read only the parts of
  the ticket's design the step cites, not the whole design, and on the Standards axis only the
  rules without a path filter and those whose filter matches a file of the diff.
- **R13** — WHEN the implementer starts a plan step, THE SYSTEM SHALL let the rules arrive through
  their path filters, the implementer reading and editing through the file tools that fire them,
  instead of having it read every rule up front.
- **R14** — WHEN Claude edits a `.ts` file of a module, THE SYSTEM SHALL load rules and
  `CLAUDE.md` text at least 20% smaller than before the ticket, every constraint they held still
  stated where it binds.
- **R15** — WHEN the ticket is verified, THE SYSTEM SHALL show, for each of R12–R14 and R16, the
  load it targets before and after, measured the same way, and a cut of at least 20% for each.
- **R16** — WHERE a skill holds a procedure most of its runs skip, THE SYSTEM SHALL keep it in a
  file beside the skill that the skill reads only on that path, and a shell procedure in a script
  run through `make`.

### One commit gate

- **R17** — THE SYSTEM SHALL state the commit gate in one file, and every other file SHALL point to
  it: WHEN `/ticket-implement` starts its first step of a session, it SHALL ask once whether each
  ready step is committed without the user's OK or waits for it, and hold the answer for the
  session; a step is ready when its reviews ran, their fixes are in and `make check` is green;
  pushing, opening a PR and merging SHALL always wait for the user's OK.

### Agents that do their own job

- **R18** — WHEN an agent of the toolkit runs, THE SYSTEM SHALL have its definition and brief name
  what it reads and what it leaves to the main session: the verifier SHALL read the requirements,
  their acceptance and the design's contracts, not the plan; no reviewer SHALL report as a finding
  an edit that only the main session may make; the implementer SHALL not stash, check out or
  commit; and every agent SHALL write its report in English for the main session, without the
  user's status block.
- **R19** — WHEN a step is reviewed, THE SYSTEM SHALL give each finding one owning pass: the
  Standards axis the binding rules, the Depth axis the shape; and SHALL run the bug hunt and the
  silent-failure hunt as one pass, only on a step that touches a write guard, a transaction, a
  test fake, concurrent access or error handling.
- **R20** — WHEN a behaviour step's implementer is done, THE SYSTEM SHALL have the main session
  run `/simplify` on the step, before the review, and the implementer SHALL never run it.

- **R21** — WHILE `/ticket-implement` runs a step, THE main session SHALL decide on the agents'
  reports and pass the findings it accepts to the implementer by `path:line`, not read the code
  or the diff to restate them; a question that needs the code SHALL go to an agent; and every
  reviewer SHALL report each finding in one shape: `path:line`, the rule or requirement, hard or
  judgement, the proposed fix.
- **R22** — WHEN `/ticket-verify` checks the requirements, THE SYSTEM SHALL run one verifier per
  group of requirements in parallel and merge their verdicts, while the Spec review of the whole
  branch still reads every requirement at once.

### Ticket artifacts that survive a change

- **R23** — WHEN a skill writes a ticket's requirements, design or plan, THE SYSTEM SHALL have
  each requirement and acceptance row state a property and its check, each design entry a decision
  and its invariant pointing to the config that holds it, and each step its outcome, its
  constraints and a check that names the state it fails on, naming a concrete path, name or
  literal only where it is a decided contract, a trap the code cannot show or a probe's target.

## Acceptance

| Req | How to verify |
|---|---|
| R1 | A probe moves a module's folder and renames a file in it (no constraint changed): `git grep` of the old names over the instruction files finds none, and `make doc-names` stays green; the probe is reverted. |
| R2 | For each fact the Context lists as told in several places, `git grep` finds its statement in one file and pointers by name elsewhere; `/doctor prompt-audit`, run by hand, reports no contradiction and no dead reference. |
| R3 | Each step's report lists every removed line with its new home, or "dropped:" and why Claude gets it right without it; review checks the list. |
| R4 | `git grep -P '\b[0-9]+\.[0-9]+\.[0-9]+\b'` and a grep for "today" and for counts over `docs/knowledge/` and the `README.md` files find each hit only in the doc that owns it. |
| R5 | The step's report lists each trap added and where; review checks each against the test of R3. |
| R6 | The local stand's `README.md`, which retells `aws.md`, is gone, and no other doc only retells. |
| R7 | A probe backticks a missing path in a skill, an agent and a `README.md`: `make check` fails on each, naming file and line. |
| R8 | A probe adds a concrete source path to a rule, a `CLAUDE.md` and a skill: `make check` fails on each; a placeholder pattern, a package specifier and a doc pointer pass. |
| R9 | A probe narrows a rule's filter to a folder that does not exist: `make check` fails naming the rule. |
| R10 | `make check` is green on the tree; a probe adds lines to a rule past 80: it fails, naming the file. |
| R11 | `claude-md.md` names the test, the owner, the pattern, and the three checks by their `make` targets. |
| R12 | Measured with `InstructionsLoaded` and the reviewers' transcripts on one step, before and after, as the mean of two runs: the Spec reviewer's reading of the ticket's design drops by at least 20%; the Standards reviewer's report cites every rule whose filter matches a file of the diff. |
| R13 | Measured the same way on one step, once the rules are trimmed: the implementer's load drops by at least 20%, and its transcript reads and edits files through the file tools. |
| R14 | Measured the same way on one session that edits a `.ts` file of a module's domain, then one of its services: the rules and `CLAUDE.md` loaded drop by at least 20%; the step ledger shows every removed constraint's new home. |
| R15 | `verification.md` records the four scenarios before and after; the measuring hook is not committed. |
| R16 | A one-step run of `/ticket-implement` loads no parallel-steps text; a parallel run reads the file beside the skill, and `make` sets up a scratch worktree with the same `.env` ports and stage as the old block; the skill's loaded size drops by at least 20%. |
| R17 | `git grep` finds the gate stated in one file and pointers elsewhere; a new session's first `/ticket-implement` step asks once, the next step of that session does not ask again. |
| R18 | The agents' files and the skills' briefs say so; on the next verification the verifier's transcript reads no `plan.md`; on the next steps no Spec report flags an unrecorded `plan.md` edit and no implementer report carries the status block. |
| R19 | `ticket-implement`'s brief splits the axes and states the hunt's condition; on the next behaviour steps Standards and Depth report no finding twice, and a step outside the condition runs no hunt. |
| R20 | `ticket-implement` runs `/simplify` from the main session and `implementer.md` forbids it; on the next behaviour step the implementer's transcript holds no `simplify` call. |
| R21 | `ticket-implement` and `reviewer.md` say so; on the next steps the main session's transcript reads no source file or diff to write a fix round, and every finding carries the four fields. |
| R22 | `ticket-verify` says so; the next verification runs the verifiers in parallel, and its wall-clock to verdicts is shorter than run 2 of `modular-monolith` (33 min for the verifier). |
| R23 | The three templates and the `ticket-feature`, `ticket-architecture` and `ticket-plan` skills say so: a step's file list names what it must pin plus the leftover grep, not every file; a design entry links a config instead of copying it; a `Verify` check names the state it fails on, and a step that replaces a guard pins one probe per guard (lesson L8 of `modular-monolith`). The ledger maps each removed instruction to its new home; each rule cites its evidence in `research.md`. |

## Open questions

### Q1 — How are the four rules' path filters narrowed?

- **Why it matters:** too narrow and a rule misses a file it binds; too wide and R14's cut is lost.
- **Options:** A — by the layer folder the rule's subject lives in (`services/`, `domain/`, …),
  checked by R9; B — by file suffix (`*.service.ts`), which follows the naming rule but misses a
  file under a new suffix.
- **Recommendation:** A, since a folder outlives a suffix and R9 catches a folder that goes.
- **Answer:** neither: the filters stay, and R14's cut comes from trimming the rules' text, since
  a step that edits domain and services together loads their union (R14 amended): D1.

### Q2 — How does the reviewer find the parts of the design a step cites?

- **Why it matters:** R12's cut depends on the reviewer not opening the whole file.
- **Options:** A — `/ticket-implement` passes the `D…` ids and the Seams heading, and the reviewer
  reads them with `grep -n` on the stable headings; B — the reviewer finds them from the step's
  text itself.
- **Recommendation:** A, as `toolkit-reading` did for the implementer: the skill knows the step.
- **Answer:** A, extended to the rules the Standards reviewer reads: D2.

### Q3 — What counts as a doc pointer or a stable anchor in R8?

- **Why it matters:** R8 must refuse the class that churned and pass the anchors `claude-md.md`
  allows (a workspace, a `make` target, a library API, the template's own infrastructure).
- **Options:** A — an allowlist of prefixes (`docs/`, `.claude/`, `.github/`, `repos/`) plus any
  span with a placeholder, and a path of depth below three; B — an explicit list of allowed names.
- **Recommendation:** A, since a list of names is itself a copy that goes stale.
- **Answer:** neither: one pattern inside `make doc-names`, a backticked path with a `/` and a
  source extension and no placeholder: D3.

### Q4 — Which rule lines are marked required, and what is the cap?

- **Why it matters:** a marker on many lines weighs as little as the bold that already opens most
  bullets; too few and a costly constraint stays unmarked.
- **Options:** A — a cap of 10, the lines chosen in the step that rewrites the rules, each from a
  breach the branch's reviews or the user's feedback found (a rule written in a service's body, a
  check after a write); B — a cap per rule file, which spreads the marks evenly whatever they cost.
- **Recommendation:** A, since the weight comes from the marks being few across the whole set.
- **Answer:** none: the marks are dropped, since the docs advise against emphasis markers and the
  branch shows no costly breach a mark would have stopped; the costliest trap leads its file in
  plain words (R16 and R17 now hold other requirements): D4.