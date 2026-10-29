# <Title> — plan

> Ticket: `<YYYY-MM-DD-HHmm>_<slug>` · Requirements: [feature.md](./feature.md) · Design: [architecture.md](./architecture.md)

## Status

<One row per step, updated in each step's commit, so the reader sees the ticket's state without
reading the steps; `git log` holds each step's commit.>

| Step | Delivers | Status |
|---|---|---|
| S1 | <the step's Delivers, in a few words> | todo |

## How to run this plan

- Branch `<type>/<slug>`; one commit per step, after the user's OK (`/ticket-implement`).
- Each step leaves `make check` green and fits one fresh session (≤ ~400 changed lines).
- A deviation is recorded in the step's findings, and in `architecture.md › Decisions` when it is a
  decision.

## Steps

#### S1 — <title>

- **Delivers:** <two to four plain lines: what exists or behaves differently once the step lands,
  without ids>.
- **Goal:** <outcome> (R1, D1).
- **Blocked by:** none.
- **Files:** <paths>.
- **Test first:** <Seam from architecture.md> — <behaviour to see red>. Or `config only`.
- **Verify:** <commands and manual checks>.
- **Model:** <model and effort, e.g. `opus medium`>
- **Status:** todo

## Requirement coverage

| Req | Steps |
|---|---|
| R1 | S1 |
