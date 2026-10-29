# <Title>

> Ticket: `<YYYY-MM-DD-HHmm>_<slug>` · Source: <link or "conversation">
> Related: [architecture.md](./architecture.md) · [plan.md](./plan.md)

## Problem

<What is wrong or missing today, and for whom, from their side. Two to four sentences.>

## Goal

<What changes for them once the ticket lands, and why now. Two to four sentences.>

## Context

<What exists today that the reader needs: current behaviour, constraints, related tickets. Terms
come from `docs/knowledge/glossary.md`.>

## Scope

- <capability in scope>

## Out of scope

- <adjacent capability left out, and where it goes instead>

## Requirements

<EARS only. One behaviour per requirement; group them under `###` headings when there are many.
A requirement states behaviour or an observable result, never a path or a code name: those go
to `plan.md › Files`, and a check below may name a command.>

- **R1** — WHEN <trigger>, THE SYSTEM SHALL <response>.
- **R2** — IF <unwanted condition>, THEN THE SYSTEM SHALL <response>.
- **R3** — WHILE <state>, THE SYSTEM SHALL <response>.

## Acceptance

| Req | How to verify |
|---|---|
| R1 | <command, request or observation that shows it, with the expected result> |

## Open questions

<For `/ticket-architecture`, such as an ADR candidate from `domain-modeling`. Ask it so "yes"
accepts the recommendation, or openly where there is room to decide. Delete the section when
empty.>

### Q1 — <question>

- **Why it matters:** <one line>.
- **Options:** A — <consequence>; B — <consequence>.
- **Recommendation:** <A, and why>.
- **Answer:** <filled when settled, naming the D… or R… it became>
