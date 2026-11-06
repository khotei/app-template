# Domain from data — plan

> Ticket: `2026-11-06-1005_domain-from-data` · Source: [roadmap entry 26](../../knowledge/roadmap.md#26-domain-from-data); no `feature.md` or `architecture.md`, the entry and the decisions below are the spec

## Status

| Step | Delivers | Status |
|---|---|---|
| S1 | a module's domain takes each limit, pattern and literal list from the data layer's table instead of declaring it again | done |

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
  domain admits of the kernel only `@app-template/kernel/data`, and of it only a value's name
  (`<name>Pattern`, `<name>Length`, `<name>Size`, `<name>Statuses`, `<name>Authors`,
  `<name>Reasons`, `<name>Kinds`); the mapper tests that compared the two copies are gone.
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
    - `import { sql } from 'drizzle-orm'` there — fails `make typecheck` with TS2307 before and
      after (the domain reaches drizzle only through the data entry);
    - `import … from '@app-template/packages/db'` there — fails before and after.
  - `grep -rn "maxTitleLength" application/chat/domain` — prints the import and its use, no
    `= 120`; prints a declaration today.
  - `grep -rn "tableMaxTitleLength" application` — prints nothing after.
  - `make doc-lint` — green.
- **Model:** `opus high`.
- **Status:** done
- **Findings:** passes: Standards, Spec, Design (rounds S1.1, S1.2); no simplify run by the main
  session (no new interface beyond two exported values), no hunt. `make check` green (244 unit,
  104 e2e); `make migration-check` green, the DDL unchanged (a planted extra enum value failed it).
  - Deviation — a file name keeps its two checks: the table's `<> ''` and the domain's
    `isNonEmpty()` carry no value to share, and a length constant would change the DDL.
  - Deviation — two exports the tables kept inline: `minFileSize` (`attachment.table.ts`) and
    `messageFailureReasons` (`message.table.ts`); files beyond the list: `assistant.llm.ts` (it
    imported the domain's `maxTitleLength`), `tooling.md` and `database.md` (old copies of the rule).
  - Deviation — the `drizzle-orm` probe is refused by `make typecheck` (TS2307), not by Biome,
    before and after: the domain guard bans only workspaces.
  - Probe — S1.2: `chats`, `ChatRepository`, `Db`, `chatStatus` (a `pgEnum`), `ChatEntity` and a
    namespace import each refused with the new message; `chatStatuses`, `maxTitleLength` admitted;
    `@app-template/kernel/config` still refused.
  - Standards — accepted, fixed in S1.2: `database.md` still said the mappers check the limits a
    model declares again (hard); `application/CLAUDE.md` restated the decision.
  - Standards — accepted, closed by the Design fix: the guard admitted the data entry whole.
  - Spec — accepted, fixed in S1.2: entry 26's goal and scope still asked for types, schemas and
    the contract's copies; the comment on `activeMessageStatuses` lost its second reader.
  - Design — accepted, fixed in S1.2: each enum's values are an exported tuple the `pgEnum` and
    the domain both read; the override admits of the data entry only a value's name
    (`invertImportNamePattern`). A table given a value's name still passes: review holds it
    (`architecture.md` › Known gaps).
  - Spec (S1.2 review, claimed) — rejected, confirmed by a probe of the main session: that Biome
    may match `importNamePattern` anywhere in the name, so a capitalised `ChatEntityStatuses`
    passes. `import { ChatEntityStatuses, chatStatuses }` in a domain file is refused on
    `ChatEntityStatuses` alone; Biome itself refuses `^` and `$` there as implicit.

## Requirement coverage

No `feature.md`; entry 26's scope (the domain's import bans, the three records, the mappers it
makes redundant, one declaration of each value) maps to S1. Brands and schemas taken from the data
layer stay out, by the decision above.
