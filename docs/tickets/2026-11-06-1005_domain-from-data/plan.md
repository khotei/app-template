# Domain from data — plan

> Ticket: `2026-11-06-1005_domain-from-data` · Source: [roadmap entry 26](../../knowledge/roadmap.md#26-domain-from-data); no `feature.md` or `architecture.md`, the entry and the decisions below are the spec

## Status

| Step | Delivers | Status |
|---|---|---|
| S1 | a module's domain takes each limit, pattern and literal list from the data layer's table instead of declaring it again | todo |

## How to run this plan

- Branch `refactor/domain-from-data`; the work stays uncommitted for the user's review.
- **Decision (A-lite, user, 2026-11-06):** the domain imports the data layer's values (a limit, a
  pattern, an enum's values) and keeps its own brands, models and refinements. Rejected: the
  domain taking the data layer's schemas too (A-full: the data layer would first declare brands
  and checked columns for every id and constrained string, and own the domain's vocabulary,
  against `modules.md` › A service rule or a model in the kernel); a shared leaf package (the
  contract would import it); declining the entry (the copies would stay to drift).
- The API contract is untouched: it still declares its own twins and imports only `effect`.

## Steps

#### S1 — The domain takes its values from the data layer

- **Delivers:** wherever the data layer's table and a module's domain declare the same limit,
  pattern or literal list (a chat title's 120, the chat, message and credential statuses, the
  message's author and failure reasons, the media type's pattern, a file name's or size's limit),
  the table's export is the only declaration and the domain imports it; the Biome override of the
  domain admits `@app-template/kernel/data` and nothing else of the kernel; the mapper tests that
  compared the two copies are gone.
- **Goal:** entry 26 in its A-lite form: one declaration of each value for the data layer and the
  domain, so a value cannot drift between them, with every brand, model and refinement staying in
  the domain, and the contract unchanged (`http-api` imports only `effect`).
- **Blocked by:** none.
- **Files:**
  - the domain files that redeclare a value of a table (`application/*/domain/*.model.ts`; find
    them by grep for each table's exported limit, pattern and `pgEnum`/literal list), and the
    table files in `kernel/data/**` that must export a value they keep private today;
  - `.misc/lint/biome.base.json` (the `application/*/domain/**` override);
  - `application/CLAUDE.md` and `docs/knowledge/architecture.md` (the domain's import rule),
    `docs/knowledge/decisions.md` (records *A module's layers*, *Checks kept in the tables*, *The
    data at the centre*: what they say about the domain's purity and the copies, rewritten, with
    the rejected A-full and the shared leaf package), `docs/knowledge/roadmap.md` (entry 26 to
    done);
  - the mapper unit tests that assert a limit equals the table's
    (`application/chat/__tests__/services/chat.mapper.test.ts` and its siblings for attachment and
    user): delete the equality assertions, keep every other case.
- **Introduces:** none (an import replaces a declaration). Removes later: none.
- **Size:** ~80 changed lines of code and tests; docs apart.
- **Test first:** `config only` for the guard: the probes below fail or pass before the step as
  stated. The values need no new test: the existing mapper and model tests keep passing over the
  imported values, and the equality assertions they replace are the ones deleted.
- **Verify:**
  - `make check` — green (unit and e2e).
  - Probes of the domain override, per [guard-probes.md](../../../.claude/skills/ticket-plan/guard-probes.md),
    each reverted after:
    - `import { maxTitleLength } from '@app-template/kernel/data'` in
      `application/chat/domain/chat.model.ts` — fails `make lint` today, passes after;
    - `import { Db } from '@app-template/kernel/config'` there — fails before and after;
    - `import { sql } from 'drizzle-orm'` there — fails before and after (the domain reaches
      drizzle only through the data entry);
    - `import … from '@app-template/packages/db'` there — fails before and after.
  - `grep -rn "maxTitleLength" application/chat/domain` — prints the import only, no
    `= 120`; prints a declaration today.
  - `grep -rn "tableMaxTitleLength" application` — prints nothing after.
  - `make doc-lint` — green.
- **Model:** `opus high`.
- **Status:** todo
- **Findings:** written when the step is reviewed.

## Requirement coverage

No `feature.md`; entry 26's scope (the domain's import bans, the three records, the mappers it
makes redundant, one declaration of each value) maps to S1. Brands and schemas taken from the data
layer stay out, by the decision above.
