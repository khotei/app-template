# <Title> — plan

> Ticket: `<YYYY-MM-DD-HHmm>_<slug>` · Requirements: [feature.md](./feature.md) · Design: [architecture.md](./architecture.md)

## Status

<The skeleton: every step of the ticket, one row each, grouped by stage, so the reader sees the
ticket's state without reading the steps. A stage holds three steps; one of one, two or four names
its reason in its heading. A row's Status is updated in the step's last round; `git log` holds the
step's commits.>

### Stage 1 — <the outcome it delivers> · completes R1

| Step | Delivers | Serves | Size | Status |
|---|---|---|---|---|
| S1 | <the step's outcome, in a few words> | R1, D1 | ~200, docs ~50 | todo |

### Stage 2 — <the outcome it delivers> (four steps: <reason>) · completes R2

| Step | Delivers | Serves | Size | Status |
|---|---|---|---|---|
| S4 | <the step's outcome, in a few words> | R2 | ~150 | todo |

## How to run this plan

- Branch `<type>/<slug>`; commits by round, under the commit gate of `.claude/rules/sdd.md ›
  Gates` (`/ticket-implement`).
- Each step is a whole deliverable, leaves `make check` green and fits one fresh session (≤ ~400
  changed lines of code and tests; its docs counted apart).
- A deviation is recorded in the step's findings, and in `architecture.md › Decisions` when it is a
  decision.

## Stage 1 — <title>

### Stage design

<The facts the stage rests on, each with its source or probe output, an assumption by its `A…`
id; then the names, signatures and files the stage fixes; then each choice it makes:>

- **<choice>** — set aside: <option> — fact: <the fact, its source or probe output> — used by: S<n>

### Steps

#### S1 — <title>

- **Delivers:** <two to four plain lines: what exists or behaves differently once the step lands,
  without ids>.
- **Goal:** <outcome, and the constraints it keeps> (R1, D1).
- **Blocked by:** none.
- **Files:** <where the step starts; the names, traps and probe targets it pins>.
- **Introduces:** <each new name → its first consumer, in this step>. Removes later: none.
- **Size:** <~ changed lines of code and tests, every file the change reaches; docs apart>.
- **Test first:** <Seam from architecture.md> — <the acceptance check, red before the step and green
  after>. Or `config only`, whose Verify has a command that fails before the step.
- **Verify:** <commands and manual checks, each with the state it fails on>.
  - **Probes** (<guard>, run at plan time): <only a step that adds, changes or removes a guard or a
    scope of one; one per ban of the scopes `/ticket-plan`'s stage procedure names, run again
    after the change; an added scope's own fail only after the change, so each shows its plan-time
    output>
    - <ban> — `<path>`: `<content>` → `<the guard's failing line>`
- **Model:** <model and effort, e.g. `opus medium`>
- **Status:** todo
- **Findings:** <written when the step commits: every finding its review raised, one line each>
  - <pass> — accepted, fixed in S<n>.2 | accepted, open | rejected: <why> — <the finding, one line>

### Stage review

<Written by the stage's last step, in its last round: every finding of the review of the stage's
diff, in the shape of a step's Findings. A stage verification, when run, is `verification.md ›
Stage 1`. A plan of one stage has no Stage review: delete this heading.>

## Stage 2 — <title>

Not prepared: `/ticket-plan <ticket folder> next` prepares it once Stage 1 lands.

## Requirement coverage

| Req | Steps | Completed in |
|---|---|---|
| R1 | S1 | Stage 1 |
| R2 | S4 | Stage 2 |
