# The slug of a title — architecture

> Ticket: `2026-01-01-0000_sample` · Requirements: [feature.md](./feature.md)

## Overview

One `make` target over a script folder of the root tooling: `make slug` prints a title's slug,
built by one function that a later command creating the folder can call.

## Structure

| Area | Change |
|---|---|
| the root tooling (`.misc/`, the `Makefile`) | a script folder for tickets, and the target |
| `docs/knowledge/tooling.md` | the target in the **Commands** table |

## Contracts

- **The slug** — lower-case letters and digits, words joined by single hyphens, at most 30
  characters, cut at a word boundary, an accented letter written as its base letter.

## Seams

| Seam | Catches | Misses |
|---|---|---|
| `make slug TITLE="<title>"`, its output | the slug's words, hyphens, cut and letters (R1–R3) | a caller of the function |

## Decisions

- **D1 — The slug is built by one exported function, the target only prints it.**
  - **Why:** the command that will create the folder calls the same function, so the two cannot
    drift apart.
  - **Cost accepted:** a module where a recipe of `tr` and `sed` would do for R1.
  - **Reversal:** one commit.
  - **Rejected:**
    - the slug built in the recipe with `tr` and `sed` — the cut and the accents need more than a
      pipe says clearly.

## Direction

- **The script's language** — recommend a Bun ES module beside the lint scripts, over a POSIX
  shell script: Unicode decomposition is one call in JavaScript and none in `sh`. Settled in
  Stage 1.

## Assumptions

- **A1 — A variable given on make's command line reaches the recipe's environment,** so the
  script reads the title from there and a title holding quotes needs no escaping. Checked in
  Stage 1, by a probe. If false: the Seam changes (the title passed as an argument).
- **A2 — Unicode decomposition (NFD) followed by dropping the combining marks turns é, ü and ç
  into e, u and c.** Checked in Stage 1, by a probe. If false: the slug Contract changes.

## Risks

- **A title of one long word.** No whole word fits in 30 characters. *Contained by:* the step that
  cuts the slug pins the case.
