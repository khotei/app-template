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

## Reproduction

<A bug ticket keeps this section; any other deletes it. The user's symptom in their words, then
one command that shows it failing on the tree as it stands.>

```sh
<one command that runs on the tree as it stands>
```

```text
<its failing output, trimmed to the symptom>
```

## Requirements

<EARS only. One behaviour per requirement; group them under `###` headings when there are many.
A requirement and its acceptance row state a property and its check, never a path or a code name:
those go to `plan.md › Files`, and a check below may name a command.>

- **R1** — WHEN <trigger>, THE SYSTEM SHALL <response>.
- **R2** — IF <unwanted condition>, THEN THE SYSTEM SHALL <response>.
- **R3** — WHILE <state>, THE SYSTEM SHALL <response>.

## Acceptance

| Req | How to verify |
|---|---|
| R1 | <command, request or observation that shows it, with the expected result> |

## Later

<The open list (`.claude/rules/sdd.md › Gates`): what the minimal feature leaves, edge cases,
hardening, open questions and optimisations, one line each with its source (the grilling, a step's
finding, the play) and, once known, its `path:line`. A Hard stage takes an item on the user's
word; before the PR each is done, moved to the roadmap's `Later`, or dropped.>

- <item> — <source> — <fate: open | done in S<n> | roadmap Later | dropped: <why>>

## Open questions

<For `/ticket-architecture`, such as an ADR candidate from `domain-modeling`. Ask it so "yes"
accepts the recommendation, or openly where there is room to decide. Delete the section when
empty.>

### Q1 — <question>

- **Why it matters:** <one line>.
- **Options:** A — <consequence>; B — <consequence>.
- **Recommendation:** <A, and why>.
- **Answer:** <filled when settled, naming the D… or R… it became, or the Direction's area and the stage that settles it>
