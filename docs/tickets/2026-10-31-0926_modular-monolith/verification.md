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
