# Lean instructions

> Ticket: `2026-11-02-1820_lean-instructions` · Source: conversation (the branch review of
> 2026-11-02: the md audit and the context research); absorbs
> [roadmap entry 17 `docs-diet`](../../knowledge/roadmap.md#17-docs-diet)
> Related: [architecture.md](./architecture.md) · [plan.md](./plan.md)

## Problem

The instruction files Claude reads (the project and layer `CLAUDE.md` files, the rules, the skills
and the agents) and the docs people read name live paths, lists of files, counts and versions.
Every move or rename of code then forces a doc edit, and a stale name slips through wherever no
check reads: on the `modular-monolith` branch every `CLAUDE.md` edit was a path rename, never a
changed constraint. A rule whose path filter stops matching after a rename stops loading, and
nothing says so. Each session also pays for instructions it does not need: editing one `.ts` file
of a module loads about 8.7k tokens of rules, and every step's reviewer reads the ticket's whole
`architecture.md`.

## Goal

The instruction files hold the pattern and the why and point to the one file that owns each fact,
so a refactor that keeps every constraint needs no doc edit, while Claude is guided at least as
well as today. `make check` refuses the kinds of drift that recurred, so the files stay this way in
later sessions without anyone re-auditing them. The three measured levers cut at least 20% of the
load each one targets.

## Context

- **How instructions load** (the context research, 2026-11-02): the root `CLAUDE.md` and every rule
  without `paths:` load at session start; a nested `CLAUDE.md` and a path-scoped rule load when
  Claude reads, writes or edits a matching file, and are not kept after compaction; an `@import`
  loads eagerly; HTML comments are stripped; a skill with `disable-model-invocation` costs nothing
  until invoked. The `InstructionsLoaded` hook logs each file that loads and why.
- **Measured load** (2026-11-02): about 1–2k tokens at session start; editing a `.ts` file of a
  module adds about 8.7k; one `/ticket-implement` step costs about 33k across its three contexts,
  and the reviewers of a behaviour step about 46k. Files loaded together repeat each other for only
  about 3%.
- **The levers that pass the 20% threshold** the user set for a cut made for tokens alone:
  - the step reviewer reads only the parts of the ticket's `architecture.md` the step cites: about
    5k per reviewer, 33% of its load;
  - the implementer stops reading every rule at the start of a step, since a path-scoped rule
    arrives on its own: about 3.7k, 24%;
  - four rules that load on any `.ts` of a module (deep modules, modules, Effect services,
    layering) get narrower path filters: 45% of the load of editing such a file together, each
    alone under 20%.
- **Where the churn sits** (the md audit, commits since the branch base): `architecture.md` 29,
  `tooling.md` 21, `naming.md` 20, `database.md` 19, `README.md` 12, `effect-tests.md` 10, the root
  `CLAUDE.md` 9, `kernel/CLAUDE.md` 8 of its 8. Facts told in several places: the rings and which
  folder holds what (5 places), versions (4), the test layout, the resource naming, the
  dependency command, the worktree ports, the database's guards, the data layer's types rule.
- **What checks today:** `make doc-names` fails on a backticked path or name the repo lacks, but
  reads only the `CLAUDE.md` files, the rules and `docs/knowledge/`, not the skills, the agents
  or any `README.md`. `make doc-width` holds lines to 100 columns. The size limits of
  `claude-md.md` (about 40 lines for a `CLAUDE.md`, about 80 for a rule) are checked by nothing,
  and four rules sit at or over 80 lines.
- **The maintenance rule exists:** `claude-md.md` already states the test a line must pass, one
  author per fact and the pattern over the instance; this ticket makes its parts checkable.
- **Where it lands:** on the `modular-monolith` branch and its PR, after that ticket's last step,
  so the texts are written against the code in its final shape. The audit's draft texts were
  written before that ticket's last steps and serve as a model, not as text to paste.

## Scope

- Every Markdown file outside `docs/tickets/`: the instruction files Claude reads, the rules, the
  skills, the agents, the PR template, the `README.md` files and `docs/knowledge/`.
- Rewriting them to patterns and pointers; deleting lines that change nothing; adding the traps the
  audit found that the code cannot show.
- Four checks in `make check`: names across every doc, no concrete path in an instruction file,
  every path filter matching a file, the size limits.
- The three context levers and a before-and-after measurement.
- A few rule lines marked required, capped in number, and a Standards review that checks them
  first.
- The roadmap's `docs-diet` entry, absorbed.

## Out of scope

- The ticket folders and the roadmap's history, which record what was true then.
- A cut made for tokens alone that saves under 20% of the load it targets.
- A hook that runs on every edit, and a check of version literals: the docs say "the pinned
  version" and point to the manifest instead.
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
  the ticket's design the step cites, not the whole design.
- **R13** — WHEN the implementer starts a plan step, THE SYSTEM SHALL let the rules arrive through
  their path filters instead of having it read every rule up front.
- **R14** — WHEN Claude edits a file of one layer of a module, THE SYSTEM SHALL load only the rules
  whose subject that layer holds.
- **R15** — WHEN the ticket is verified, THE SYSTEM SHALL show, for each of R12–R14, the load it
  targets before and after, measured the same way, and a cut of at least 20% for each.

### Required rules

- **R16** — WHERE a rule line states a constraint whose breach the branch found costly and no
  check refuses, THE SYSTEM SHALL mark it `**Required:**`; IF the marked lines across all rules
  exceed the cap the maintenance rule names, THEN `make check` SHALL fail, naming the count.
- **R17** — WHEN a reviewer reviews a step on the Standards axis, THE SYSTEM SHALL have it check
  first every marked line that binds the diff's files, and report a breach of one as a hard
  finding that the step is not committed with.

## Acceptance

| Req | How to verify |
|---|---|
| R1 | A probe moves a module's folder and renames a file in it (no constraint changed): `git grep` of the old names over the instruction files finds none, and `make doc-names` stays green; the probe is reverted. |
| R2 | For each fact the Context lists as told in several places, `git grep` finds its statement in one file and pointers by name elsewhere. |
| R3 | Each step's report lists every removed line with its new home, or "dropped:" and why Claude gets it right without it; review checks the list. |
| R4 | `git grep -E '\b[0-9]+\.[0-9]+\.[0-9]+\b'` and a grep for "today" and for counts over `docs/knowledge/` and the `README.md` files find each hit only in the doc that owns it. |
| R5 | The step's report lists each trap added and where; review checks each against the test of R3. |
| R6 | The local stand's `README.md`, which retells `aws.md`, is gone, and no other doc only retells. |
| R7 | A probe backticks a missing path in a skill, an agent and a `README.md`: `make check` fails on each, naming file and line. |
| R8 | A probe adds a concrete source path to a rule and a `CLAUDE.md`: `make check` fails on each; a placeholder pattern and a doc pointer pass. |
| R9 | A probe narrows a rule's filter to a folder that does not exist: `make check` fails naming the rule. |
| R10 | `make check` is green on the tree; a probe adds lines to a rule past 80: it fails, naming the file. |
| R11 | `claude-md.md` names the test, the owner, the pattern, and the four checks by their `make` targets. |
| R12 | Measured with `InstructionsLoaded` and the reviewers' transcripts on one step, before and after: each reviewer's ticket reading drops by at least 20%. |
| R13 | Measured the same way on one step: the implementer's load drops by at least 20%. |
| R14 | Measured the same way on editing one `.ts` file of a module's domain and one of its services: the rules loaded drop by at least 20%. |
| R15 | `verification.md` records the three scenarios before and after; the measuring hook is not committed. |
| R16 | `git grep -c` of the marker over `.claude/rules/` totals no more than the cap `claude-md.md` names; a probe marks lines past the cap: `make check` fails, naming the count. |
| R17 | A probe diff writes a marked rule inline (a rule in a service's body): the Standards reviewer reports it as a hard finding citing the marked line, and `/ticket-implement` holds the commit. |

## Open questions

### Q1 — How are the four rules' path filters narrowed?

- **Why it matters:** too narrow and a rule misses a file it binds; too wide and R14's cut is lost.
- **Options:** A — by the layer folder the rule's subject lives in (`services/`, `domain/`, …),
  checked by R9; B — by file suffix (`*.service.ts`), which follows the naming rule but misses a
  file under a new suffix.
- **Recommendation:** A, since a folder outlives a suffix and R9 catches a folder that goes.
- **Answer:**

### Q2 — How does the reviewer find the parts of the design a step cites?

- **Why it matters:** R12's cut depends on the reviewer not opening the whole file.
- **Options:** A — `/ticket-implement` passes the `D…` ids and the Seams heading, and the reviewer
  reads them with `grep -n` on the stable headings; B — the reviewer finds them from the step's
  text itself.
- **Recommendation:** A, as `toolkit-reading` did for the implementer: the skill knows the step.
- **Answer:**

### Q3 — What counts as a doc pointer or a stable anchor in R8?

- **Why it matters:** R8 must refuse the class that churned and pass the anchors `claude-md.md`
  allows (a workspace, a `make` target, a library API, the template's own infrastructure).
- **Options:** A — an allowlist of prefixes (`docs/`, `.claude/`, `.github/`, `repos/`) plus any
  span with a placeholder, and a path of depth below three; B — an explicit list of allowed names.
- **Recommendation:** A, since a list of names is itself a copy that goes stale.
- **Answer:**

### Q4 — Which rule lines are marked required, and what is the cap?

- **Why it matters:** a marker on many lines weighs as little as the bold that already opens most
  bullets; too few and a costly constraint stays unmarked.
- **Options:** A — a cap of 10, the lines chosen in the step that rewrites the rules, each from a
  breach the branch's reviews or the user's feedback found (a rule written in a service's body, a
  check after a write); B — a cap per rule file, which spreads the marks evenly whatever they cost.
- **Recommendation:** A, since the weight comes from the marks being few across the whole set.
- **Answer:**
