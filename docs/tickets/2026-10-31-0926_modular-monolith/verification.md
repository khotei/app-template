# Modular monolith — verification

> Ticket: `2026-10-31-0926_modular-monolith` · Requirements: [feature.md](./feature.md) · Plan: [plan.md](./plan.md)

<!-- /ticket-verify appends one dated section per run; earlier runs stay as history. -->

## 2026-11-02 — run 1

**Verdict:** pass

Branch `refactor/modular-monolith` at `2c89cfe395`, merge base `5bfec347df`. `make check` green:
Biome over 263 files, `tsc -b`, 199 unit tests in 21 files, 102 e2e in 22 files, the web bundle
check; `make migration-check` generates no SQL.

### Requirements

| Req | Result | Evidence |
|---|---|---|
| R1 | pass | The OpenAPI document of `Api` is identical on `main` and HEAD (13 operations). No unit case title of `main` is gone; 5 e2e titles follow the renamed verbs (`outbox row` → `job`, the bucket's cases → `FileRepository`). |
| R2 | pass | The journey `apps/__e2e__/chat.e2e.ts` reaches the reply `done` and the title, leaves no unsent row in `jobs` and reads the reply's provenance from it; `apps/worker/chat/` changed only in imports. |
| R3 | pass | The journey: after `chats.delete` the file is `none` and the attachment `AttachmentNotFoundError`; `kernel/__e2e__/data/chat/chat.repository.e2e.ts` "delete takes the messages' attachments with them by the cascade"; `apps/__e2e__/use-cases/delete-chat.e2e.ts` keeps rows and bytes on a refused delete. |
| R4 | pass | One migration, `kernel/data/migrations/20261101174807_init`. Applied to a fresh `postgres:18.6-alpine` beside `main`'s two: the `pg_dump --schema-only` dumps differ only by `outbox` → `jobs` and order (6 tables, 4 enums, 7 indexes, 12 constraints each). |
| R5 | pass | `make migration-check` exits 0 with no SQL. |
| R6 | pass | Workspaces: `kernel`, `application/{chat,identity,identity/contract,use-cases}`, `packages/{aws,db,llm,queue,s3,testing,ui}`, `http-api`, `apps/{api,worker,web,__e2e__}`, `deployment`; `git ls-files domain infrastructure e2e packages/config` is empty. |
| R7 | pass | No module imports another's internals (`git grep`); Biome refuses `@app-template/identity/services` in chat's services, naming "A module's layers; Module contracts". |
| R8 | pass | `application/chat` holds `domain`, `services`, `infrastructure`, `__tests__`; identity adds its `contract/` (D3); the three `*.use-case.ts` sit in `application/use-cases/chat/`. |
| R9 | pass | `kernel/data/` imports only `packages/*` and itself; all 17 `*.table.ts`, `*.entity.ts`, `*.repository.ts` live there; `Db.layer` takes `PgClient` and `FileRepository.layer` takes `S3Bucket` from the context. |
| R10 | pass | `application/use-cases/chat/send-message.use-case.ts:102,111` enqueue inside `transaction.run` (`:121`); `apps/__e2e__/use-cases/send-message.use-case.e2e.ts` leaves `jobs` empty when a `CHECK` refuses the title job. |
| R11 | pass | Outside `__tests__`/`__e2e__`, only `packages/testing/*` matches a test folder name; `application/` holds no e2e; `vitest.config.ts` picks `**/__tests__/**/*.test.ts` and `**/__e2e__/**/*.e2e.ts`. |
| R12 | pass, deviation recorded | Another module's internals: refused with the record named (R7). An undeclared workspace (`@app-template/queue` in identity's services) fails `tsc -b` with TS2307, naming the import but no record: `tsc` carries no message (`plan.md` S21 findings); kept as recorded, `feature.md` unchanged. |
| R13 | pass | A module's domain or the identity contract in the kernel, and a module in `packages/db`: refused, naming "One kernel"; `.claude/rules/modules.md` "A cycle of modules through their contracts" links `decisions.md#module-contracts`. |
| R14 | pass | In `kernel/data/`: a module's domain refused ("The data at the centre; Clients from the context"), `#kernel/aws/aws.client` refused ("Jobs as a table in the data layer"), `@app-template/kernel/config` refused. |
| R15 | pass | Refused with a record each: the kernel in a module's `domain/` and in the contract, `kernel/llm` in services, `#infrastructure/*` in services, `kernel/postgres` in a use case, the kernel in `packages/db`; `kernel/data/chat` in services passes. |
| R16 | pass | `make bundle-check` green; throwaway imports of `FileRepository`, `ChatService` and `SendMessageUseCase` into `apps/web/app/main.ts` each fail it, naming the bundled key. |
| R17 | pass | `#testing-e2e/*` in a kernel unit test and `@app-template/kernel/testing-e2e` in a module's unit test are refused, naming "Tests in their folders". |
| R18 | pass | The `DeleteUserUseCase` snippet in `docs/knowledge/decisions.md:48-60` and `docs/knowledge/architecture.md:220-230`; the worker's handlers call only the two chat use cases; the only jobs are chat's two queues. |
| R19 | pass | `make doc-names` green; `docs/knowledge/architecture.md` has the seven sections; the glossary has the ten terms and lists "Component" under _Avoid_; no doc outside `docs/tickets/` names a gone workspace, path or `<Entity>`. |
| R20 | pass | 22 records in `decisions.md`, each with the seven fields; every Biome message names a record whose heading exists; the five `modules.md` anchors resolve; `CLAUDE.md` holds the pointer. |

**Not verifiable:**
- `make reset` and `make up` on the local stack, R4's literal procedure: not run, so as not to
  wipe the local database. Checked instead on fresh containers of the same pinned image.
- R13's workspace cycle failing `make check`: rests on `tsc -b`'s TS6202, not probed.

### Review

#### Standards

1. **Hard, by the rule's letter: `Layer.provideMerge` in test layers.** `effect-services.md ›
   Layers` says "Never publish internals with `Layer.provideMerge`; the exception is the client a
   caller opens transactions on (`DbTest`)". The test layers and unit tests merge repository
   stacks and seed layers: `application/chat/__tests__/services/{attachment,chat,message}.service.test.ts`,
   `application/use-cases/__tests__/testing/chat.test-layer.ts`,
   `application/identity/__tests__/services/user.service.test.ts`,
   `apps/__e2e__/testing/chat.test-layer.ts`. Exposing the repositories is these layers' point;
   more a rule gap than a code fault.
2. **Judgement: one call per id.** `application/chat/services/attachment.service.ts:186`
   tags each file with `Effect.forEach(ids, (id) => files.update(...))`; `layering.md` asks for
   one batch call for reads and deletes; `FileRepository.delete` takes an array, `update` does
   not.
3. **Judgement: a rule in a use case.** `send-message.use-case.ts` branches on `isFirstMessage`
   to enqueue the title job (`modules.md › A rule in a use case`); the status write runs a model
   function and is allowed.
4. **Judgement: what-comments** in `attachment.service.ts` ("One batch read; …", "A send without
   files binds nothing …") (`comments.md` Gate A).
5. **Judgement: `messageId: null`** in an entity `where` (`attachment.service.ts:187`);
   `effect-schema.md` allows `null` in a wire DTO, the data layer speaks its own types.
6. **Smells, suppressed by `kernel/CLAUDE.md` and the data layer's types:** `kernel/llm`
   configuring `packages/llm`; `S3BucketOfStage` beside `S3BucketFromConfig`; `FileEntity.id` a
   string.

Not reviewed: the docs, the migration SQL and most test bodies.

#### Spec

1. **Judgement, partial: the mappers' e2e covers the limits, not the statuses.** D11: "a limit or
   a pattern lives twice (`maxTitleLength`, `mediaTypePattern`, `secretHashPattern`, the
   statuses); a drift shows as a write the database refuses, caught by the mappers' e2e".
   `apps/__e2e__/mappers/chat.mapper.e2e.ts` writes only the longest title; no case writes each
   status through the entity.
2. **Judgement, scope: two process commits ride the branch.** `0ab631fd15` and `c9dc05486d`
   (`docs(sdd)`: the simplify pass and the Depth axis in `/ticket-implement`) carry this
   ticket's `Refs:`; `feature.md › Scope` names no change to the review process.

Decided: the two commits stay on the branch, named in the PR's description.

Not scope creep: the apps' ban on `*/services` (D4's S17 note), the bans on relative paths and
on one app importing another (S21 note, `decisions.md`). Nothing found implemented wrong: the
bundle pattern matches the architecture's, and `kernel/data/**` follows `kernel/**` in
`biome.json`.

### Simplifications

1. Write each `chat_status` and `message_status` value through its mapper in
   `apps/__e2e__/mappers/chat.mapper.e2e.ts`, a loop in the existing case: closes Spec 1, the
   one duplicated rule D11 names without a test.
2. Name test layers in `effect-services.md › Layers`' exception: "and a test layer, which merges
   what its cases read". One line; the rule then says what the code does (Standards 1).

Both accepted as step S24 of `plan.md`.

Considered and dropped: one batched `files.update` (Standards 2). S3 tags one object per request,
so an array `where` would move the loop into the repository, not remove it.

### Lessons

#### L1 — Doc lines over 100 characters, re-wrapped in review

- **Evidence:** a re-wrap in rounds S3.2, S4.2, S5.2, S6.2, S7.2, S9.2, S12.2, S13.2, S18.2,
  S19.2; 33 prose lines over 100 remain in tracked docs.
- **Cost:** a finding in ten reviews, and part of ten fix rounds.
- **Proposed change:** a `make doc-width` gate in `make check`, failing on a line over 100
  characters in a tracked `*.md` outside `docs/tickets/`, fences, tables and URLs; its commit
  re-wraps the lines.
- **Applied:** yes, `b98639da49`

#### L2 — A step's Files missed the docs naming what it moved

- **Evidence:** "Beyond the Files" in S13, S14, S15, S16, S18, S19 and S23: each touched docs
  and rules that named a moved path or name.
- **Cost:** the plan's size estimates ran low (S4 and S17 past ~400 lines) and the Files list
  stopped telling the reviewer what to expect.
- **Proposed change:** `/ticket-plan`: "a step that moves or renames a path or name lists every
  file `git grep` finds naming it".
- **Applied:** yes, `b98639da49`

#### L3 — A rewrite or a simplify pass dropped a fact stated nowhere else

- **Evidence:** S15: `/simplify` removed `buildSet`, restored in round 2; S22: the page's rewrite
  dropped two instructions (a group joins `Api` before `.middleware(SchemaErrors)`; ownership is a
  `where` field), restored in round 2.
- **Cost:** two fix rounds, and a behaviour regression (`buildSet` drops a key outside the set)
  had review missed it.
- **Proposed change:** `/ticket-implement`'s Spec override: "the Spec axis names, for each
  deleted statement or guard, where it now lives, or reports it lost".
- **Applied:** yes, `b98639da49`

## 2026-11-02 — run 2

**Verdict:** fail

Branch `refactor/modular-monolith` at `dc1eec9fd9` (S1–S39), merge base `5bfec347df`. `make check`
green: Biome over 248 files, `tsc -b`, 221 unit tests in 24 files, 104 e2e in 17 files, the web
bundle check, `make migration-check`. R1 fails on three answers S38.2 changed; R13 is partial.

### Requirements

| Req | Result | Evidence |
|---|---|---|
| R1 | fail | (1) `AttachmentNotFoundError`'s body is `{ _tag, ids }`, was `{ _tag, id }` (`attachment.error.ts:5-8`): the OpenAPI documents of merge base and HEAD differ only in `AttachmentNotFoundErrorEncoded`. (2) The loser of two sends of one file may answer `500`, was always `409` under the dropped `forUpdate`; `sendRacing` (`apps/e2e/api/chat.e2e.ts:75-88`) now counts a bare `500` as refused, a weakened assertion. (3) A send answers its attachments in creation order, was the order asked: a probe sending `[b, a]` passes on merge base, fails on HEAD. (1) and (2) are in `plan.md` and `decisions.md`, (3) in `plan.md` only; `feature.md` R1 is unchanged. |
| R2 | pass | The journey reaches the reply `done` and the title; worker handlers changed in imports only; attempts 3 and 5 (`kernel/aws/resources/resources.ts:11-12`), delay and dead letter in `packages/queue/queue.ts:33-46`. |
| R3 | pass | After `chats.delete`, `files.selectOne` answers none and the attachment `AttachmentNotFoundError`; the repository's cascade case. |
| R4 | pass | One migration `20261101174807_init`; on a clean `postgres:18.6-alpine` its `pg_dump --schema-only` equals merge base's two (with `outbox` → `jobs`) up to order: 6 tables, 4 enums, 7 indexes, 12 constraints. |
| R5 | pass | `make migration-check` exit 0, no SQL. |
| R6 | pass | Workspaces `http-api`, `application`, `kernel`, `packages`, `apps/{api,e2e,web,worker}`, `deployment`; `git ls-files domain infrastructure e2e apps/__e2e__` empty; `packages/` names no app workspace nor chat, attachment, assistant. |
| R7 | pass | chat takes only `UserId` from identity's contract; identity imports no chat; `modules.md:13-20`. |
| R8 | pass | Each module's layers as named; the three use cases in `application/use-cases/chat/`; layer-direction probes red. |
| R9 | pass | `kernel/data` source imports only `packages/db`, `packages/s3`, `#kernel/data`; its 17 table, entity and repository files; `PgClient`, `S3Bucket` from the context. |
| R10 | pass | `send-message.use-case.ts:121,130` queues inside `transaction.run` (`:140`); a refused title job leaves `jobs` empty. |
| R11 | pass | Outside `__tests__/`, `__e2e__/`: only `apps/e2e` and `packages/testing`, each export of which 2+ units read. |
| R12 | pass | 6 import forms of another module's `#identity/…` refused by the GritQL plugin naming `decisions.md › Imports through subpaths`; a deep path and an undeclared workspace fail with TS2307. |
| R13 | partial | Kernel in `kernel/config` and `packages/db` fails with TS2307, a value cycle with `noImportCycles`, a `references` cycle with TS6202; but `"@app-template/kernel"` declared in `packages/package.json` plus an import of `@app-template/kernel/config` in `packages/db` passes `tsc -b` and Biome. Not in `architecture.md › Known gaps`. |
| R14 | pass | Chat's model, `kernel/config`, `kernel/aws` refused in `kernel/data` naming the records; `#kernel/aws/aws.client` refused by the plugin. |
| R15 | pass | Kernel into domain and contract, `kernel/llm` into services, `#chat/infrastructure` into services, `kernel/postgres` into a use case: each refused naming the record. |
| R16 | pass | `ChatRepository` in `apps/web/app/main.ts` fails `bundle-check`; `ChatService`, `SendMessageUseCase`, `AssistantLlmFromConfig` through `http-api` fail it by key. |
| R17 | pass | A unit test building `DbTest` fails `make test-unit`; container count unchanged; `modules.md:31-32`. |
| R18 | pass | The `PlaceOrderUseCase` example in `architecture.md:218-240` and `decisions.md:56-65`. |
| R19 | pass | `make doc-names doc-width ids` exit 0; the seven sections; ten glossary terms, `Component` under _Avoid_. (Spec finds one stale label, below.) |
| R20 | pass | 24 records of 7 fields; the 9 records `biome.json` and the plugin name exist; 17 anchors resolve. |
| R21 | pass | Every `@app-template/…` import is by folder; no `"paths"`. |

**Not verifiable:** R4 through `make reset` and `make up` (it wipes the local database; a separate
container of the same image instead); the `500` of R1's race, inferred from the code, the test and
the record; the attachments' order on Postgres, probed through the memory layer only.

### Review

#### Standards

No hard violation in production code; judgement calls:

1. `generate-assistant-message.use-case.ts` › `settleWith` reads the chat with
   `Effect.map(Option.getOrThrow)`: a `throw` (`effect-schema.md › Failures`) where a pipeable
   defect fits (`deep-modules.md`).
2. `apps/api/attachment/attachment.handler.ts`: `matchesExtension`, `decodeDeclaredType` check the
   media type against the extension, arguably a rule in a handler (`layering.md › Handlers`).
3. `send-message.use-case.ts`: `isFirstMessage` decides the title job (`modules.md`); kept in S38
   on the user's word.
4. `chat.mapper.ts` imports `type ChatWhere` from `chat.service.ts`, which imports the mapper: a
   cycle through a type (`deep-modules.md`), and Feature Envy in `encodeChatWhere`.
5. `attachment.repository.ts`: `messageId === null ? isNull(…) : eq(…)` where `chat.repository.ts`
   reads its nullable `title` through `Option` (`effect.md`).

Smells: the skip-reason union plus log table repeated in the two generate use cases; `getMany`'s
inline `where` type written twice in `attachment.service.ts`; two `new TextEncoder()`; Divergent
Change in `assistant.llm.ts` (~270 lines: prompt, early finish and retry, hash, provenance, stub);
`SendMessageUseCase.send` ~90 lines; the private `move` in both models; `identity` from
`'effect/Function'` in two repositories, from `'effect'` in the third. Tests: `chat.mapper.test.ts`
rebuilds fixtures `#testing/chat/chat.test-fixture` has; its title-limit case compares constants
(kept in S34 on the user's word). `packages/`, `deployment/`, docs and the plugin not reviewed.

#### Spec

R1–R21 hold on the Spec axis's reading, with five departures:

1. Scope: ten commits outside the ticket (`docs(sdd)` ×4, `chore(tooling)` ×2, `docs(roadmap)` ×3,
   `docs(lean-instructions)`), hidden under the ticket's title once squashed.
2. Scope, security weight: `6c43a60a76` drops `git push*` from `ask` in `.claude/settings.json` and
   the `deny` of `git push --force`, `--no-verify` and `bun test*`; nothing in `feature.md` asks
   for it.
3. Scope: the `doc-width` gate (run 1's L1, applied on the user's OK).
4. `application/chat/__tests__/domain/resources.test.ts:4` imports `@app-template/kernel/aws`; a
   domain file may not, and tests import as their source does (`architecture.md:90`).
5. `docs/knowledge/architecture.md:103` and the ticket's matrix (line 78) let services import
   `packages/aws`; `biome.json:177` admits only `{db,queue}`. No service imports it.
6. `docs/knowledge/architecture.md:63`: the arrow label `/domain only` names a per-layer subpath
   D21 removed (R19); `make doc-names` reads no diagram label.

### Simplifications

1. Amend `feature.md` R1 (and its acceptance row) to name the three answers S38.2 changed, and
   record the attachments' creation order in `decisions.md`; or restore the order asked.
2. Close R13's manifest gap: the GritQL plugin refuses `@app-template/{kernel,application,
   http-api}` and the apps from `packages/**`; record the probe in `architecture.md › Known gaps`
   if left open.
3. `architecture.md:63` and `:103`, the ticket matrix line 78: the label and the services' packages
   as `biome.json` holds them.
4. `resources.test.ts` from `__tests__/domain/` to the layer its import belongs to.
5. `settleWith`: `Effect.flatMap(Effect.fromOption(…))` with `Effect.orDie`, no `getOrThrow`.
6. Break the `ChatWhere` type cycle: `encodeChatWhere` into the service, its one caller.
7. `getMany`'s `where` named once beside `AttachmentWhere`; `identity` imported from `'effect'`
   alike; the attachment repository's `messageId` through `Option`, as the chat's `title`.

Accepted on the user's word: 1 as step S40 (R1 amended, the order recorded, not restored), 2 as
S41, 3–7 as S42 of `plan.md`. Spec 1–2: kept on the user's word; the PR body lists the commits
outside the ticket, `6c43a60a76` among them.

### Lessons

#### L4 — A Verify check that could not fail

- **Evidence:** S26 and S27 (the grep matched the internal `#api/layer` imports and the
  repositories' keys, narrowed), S30 (a probe that could not fail; `git ls-files
  'packages/**/tsconfig.json'` matched nothing in any tree state), S36 (the grep found the vendored
  `repos/effect`), S37 (a probe port passed the old grep).
- **Cost:** a check reported green that proved nothing, found by review or by chance, in five steps.
- **Proposed change:** `implementer.md › Evidence`: "run each Verify grep or probe once against a
  planted hit first; one that stays green is reported and replaced".
- **Applied:** yes, `implementer.md › Evidence`

#### L5 — An HTTP answer changed with no amendment of R1

- **Evidence:** S31 (a race counts a defect's `500` as refused) and S38.2 (the error's `ids`, the
  `500` of the lockless race, the attachments' order), each passing step review; this run fails R1
  on them.
- **Cost:** a failed verification and an amendment step; a client reading `error.id` breaks.
- **Proposed change:** a `make api-check` in `make check` that diffs the generated OpenAPI document
  against a committed snapshot, so a contract change fails until the snapshot and R1 move with it.
- **Applied:** accepted, step S41

#### L6 — Docs restating what a config holds drifted from it

- **Evidence:** review found `decisions.md` and `architecture.md` out of step with the code in S32,
  S33, S35, S37 (a step of its own) and S39 (the matrix's TS2307 claims); this run finds two more in
  `architecture.md`, both restating `biome.json`.
- **Cost:** a review finding in five steps and one whole step.
- **Proposed change:** none here: `lean-instructions` cuts the restatements (one author per fact);
  its feature.md names it.
- **Applied:** no, left to `lean-instructions`

#### L7 — Biome's override semantics rediscovered per step

- **Evidence:** S25 (round S25.2), S27, S28, S29, S30: Biome takes the last matching override and
  replaces the options of two, found again each time.
- **Cost:** a fix round in S25, gaps recorded in S27 and S28, 1931 lines of `biome.json`.
- **Proposed change:** none: S39 replaced the override lists with one GritQL plugin (297 lines).
- **Applied:** yes, S39
