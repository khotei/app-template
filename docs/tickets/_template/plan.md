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
- Each step leaves `make check` green and fits one fresh session (≤ ~400 changed lines).
- A deviation is recorded in the step's findings, and in `architecture.md › Decisions` when it is a
  decision.

## Steps

#### S1 — <title>

- **Delivers:** <two to four plain lines: what exists or behaves differently once the step lands,
  without ids>.
- **Goal:** <outcome, and the constraints it keeps> (R1, D1).
- **Blocked by:** none.
- **Files:** <where the step starts; the names, traps and probe targets it pins>.
- **Size:** <~ changed lines, every file the change reaches>.
- **Test first:** <Seam from architecture.md> — <behaviour to see red>. Or `config only`.
- **Verify:** <commands and manual checks, each with the state it fails on>.
  - **Probes** (<guard>, run at plan time): <only a step that changes or removes a guard; one per
    ban of each scope it adds, changes or removes and of every scope whose files those also
    match, as `/ticket-plan` step 3 defines both, run again after the change>
    - <ban> — `<path>`: `<content>` → `<the guard's failing line>`
- **Model:** <model and effort, e.g. `opus medium`>
- **Status:** todo
- **Findings:** <written when the step commits: every finding its review raised, one line each>
  - <pass> — accepted, fixed in S<n>.2 | accepted, open | rejected: <why> — <the finding, one line>

## Requirement coverage

| Req | Steps |
|---|---|
| R1 | S1 |
