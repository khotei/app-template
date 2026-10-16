# <Title> — plan

> Ticket: `<YYYY-MM-DD>_<slug>` · Requirements: [feature.md](./feature.md) · Design: [architecture.md](./architecture.md)

## How to run this plan

- Branch `<type>/<slug>`; one commit per step, after the user's OK (`/ticket-implement`).
- Each step leaves `make check` green and fits one fresh session (≤ ~400 changed lines).
- A deviation is recorded in the step's findings, and in `architecture.md › Decisions` when it is a
  decision.

## Steps

#### S1 — <title>

- **Goal:** <outcome> (R1, D1).
- **Blocked by:** none.
- **Files:** <paths>.
- **Test first:** <Seam from architecture.md> — <behaviour to see red>. Or `config only`.
- **Verify:** <commands and manual checks>.
- **Status:** todo

## Requirement coverage

| Req | Steps |
|---|---|
| R1 | S1 |
