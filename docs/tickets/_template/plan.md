# <Title> — plan

> Ticket: `<YYYY-MM-DD-HHmm>_<slug>` · Requirements: [feature.md](./feature.md) · Design: [architecture.md](./architecture.md)

## Status

<One row per step, updated in the step's last round, so the reader sees the ticket's state without
reading the steps; `git log` holds the step's commits.>

| Step | Delivers | Status |
|---|---|---|
| S1 | <the step's Delivers, in a few words> | todo |

## How to run this plan

- Branch `<type>/<slug>`; commits by round, under the commit gate of `.claude/rules/sdd.md ›
  Gates` (`/ticket-implement`).
- Each step is a whole deliverable, leaves `make check` green and fits one fresh session (≤ ~400
  changed lines of code and tests; its docs counted apart).
- A deviation is recorded in the step's findings, and in `architecture.md › Decisions` when it is a
  decision.

## Steps

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
    scope of one; one per ban of the scopes `/ticket-plan` step 3 names, run again after the
    change; an added scope's own fail only after the change, so each shows its plan-time output>
    - <ban> — `<path>`: `<content>` → `<the guard's failing line>`
- **Model:** <model and effort, e.g. `opus medium`>
- **Status:** todo
- **Findings:** <written when the step commits: every finding its review raised, one line each>
  - <pass> — accepted, fixed in S<n>.2 | accepted, open | rejected: <why> — <the finding, one line>

## Requirement coverage

| Req | Steps |
|---|---|
| R1 | S1 |
