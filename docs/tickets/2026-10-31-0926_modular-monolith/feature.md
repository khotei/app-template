# Modular monolith

> Ticket: `2026-10-31-0926_modular-monolith` · Source: conversation, research doc
> [Модульный монолит: руководство](https://claude.ai/artifact/L1MM6ostJgNz5Lhrpw36Gv) (tabs
> "Черновик" and "Исследование"), [research.md](./research.md) · Related:
> [architecture.md](./architecture.md) · [plan.md](./plan.md)

## Problem

The code is partitioned by technical layer (`domain`, `application`, `infrastructure`,
`http-api`, `apps`), with one folder per aggregate inside each layer. A feature of one business
capability crosses six workspaces, and nothing checks the boundary between aggregates inside a
layer: `chat` and `attachment` import each other in `domain` and `infrastructure`, a cycle no
guard reports. As the template grows to many capabilities, the boundaries hold only by review.

## Goal

The code is partitioned by business capability: each module owns its rules, its tables and its
adapters, keeps the current layering inside, and is reachable from other modules only through
its module contract, a package with no implementation. The build, not review, rejects an import
into another module's internals, a cycle, and a table declared outside its owner's schema.
Behaviour seen from outside does not change.

## Context

- **Research (2026-10-30).** The Software Architecture Guild guide (styles, boundaries, domains,
  validation) and Spring Modulith, kgrzybek/modular-monolith-with-ddd, Packwerk, Nx and
  dependency-cruiser: [research.md](./research.md), with 16 candidate rules.
- **Guards available in this repo (verified 2026-10-30).** Biome 2.5.15 `noRestrictedImports`
  catches `import`, `export * from` and `export { x } from`; one override on a module's path with
  the group `@app-template/*`, `@app-template/**` and negations for the allowed packages bans
  every other one (without `**`, a deep path passes). tsgo 7.0.2 refuses circular project
  references (TS6202). `bunfig.toml` sets `linker = "isolated"`, so an undeclared workspace fails
  with TS2307. The `typescript` JS API is absent (TS 7 is native), so dependency-cruiser would need
  another parser.
- **The code today (researcher, 2026-10-30 and 2026-10-31).**
  - The only flow writing several tables in one transaction is the send of a message: `chats`,
    `messages`, `attachments` (bind) and `outbox`. Nothing but the user's own code writes `users`
    or `credentials`; no join reaches `users`; no code updates or deletes a user, whose group has
    one endpoint, `POST /users`.
  - Foreign keys: `chats.user_id → users.id` and `attachments.user_id → users.id` (no action);
    `credentials.user_id → users.id`, `messages.chat_id → chats.id` and `attachments (message_id,
    chat_id) → messages (id, chat_id)` cascade. No triggers. Deleting a chat cascades to its
    messages and attachments, and the chat service deletes the bytes by the ids it read.
  - `chat` ↔ `attachment` is two-way: 8 files of chat import attachment, 3 of attachment import
    chat. The user's code is 262 lines, its only rules `ensure` and `authenticate`, and it imports
    nothing of chat or attachment.
  - Chat's domain, application and infrastructure need of the user only `UserId` (about 20 files);
    chat's HTTP side also needs `Auth`, `CurrentUser` and `UserUnknownError`. All four import only
    `effect` and `effect/http-api`, and the browser loads them through the HTTP contract.
  - `SchemaErrors` is attached only where `Api` is assembled; `RequestInvalidError` and
    `RequestIssue` are raised by the attachment handler too; the limits and the two attachment
    errors serve only the chat and attachment groups.
  - `Status` is used only by the chat and the message; `job-ledger` (22) plans to give it whole to
    the outbox. The outbox carries two queues, `assistantMessage` (with a dead letter) and
    `chatTitle`, both chat to chat; its sender and relay only insert into and select from it.
  - `user` is a reserved word in Postgres: `create schema user` is a syntax error.
- **Drizzle per module (researcher, 2026-10-31; drizzle-kit 1.0.0-rc.5, throwaway
  `postgres:18-alpine`).**
  - `snakeCase.schema('<m>')` returns `pgSchema(name, 'snake_case')`; the schema object must be
    exported from a scanned entity file, or drizzle-kit emits no `CREATE SCHEMA`.
  - Two `PgDrizzle.make({ relations })` instances over one `PgClient` share one pool; inside
    `SqlClient.withTransaction` both ran in the same backend transaction, and a rollback undid
    writes through both. `defineRelations` per module works inside the module; a relation to
    another module's table is impossible without importing that table.
  - On a database migrated by today's migrations with a row per table, one generated migration
    moved 6 tables and 4 enums into their schemas and dropped the two foreign keys to `users`:
    every row, enum, index (the partial unique one too), in-module foreign key and cascade
    survived. Generation needs a rename hint per table and per enum (10), else `missing_hints`;
    `make migration-check` runs without hints, so this migration is generated by hand once.
  - The journal stays in `drizzle.__drizzle_migrations`; a second `generate` reports no change; a
    fresh database applies every migration; one migration history serves every schema.
  - The chat, message and attachment repositories compile over a per-module Drizzle with only the
    instance's name changed; a `with:` query returns the same shape; the SQL differs only by the
    schema prefix. The one relation across modules, `users.chats`, has no reader.
  - Raw SQL in the journey's e2e names `outbox` and `messages` unqualified and breaks after the
    move. No `search_path`, `TRUNCATE` or `public.` exists in the code; e2e databases copy a
    migrated template, schemas included.
- **Roadmap.** Entry 23; `shared-files` (16), `assistant-files` (18) and `job-ledger` (22) depend
  on it.

## Scope

- `application/`, every business rule of the app: two modules, each a workspace with a flat
  `domain/` and `infrastructure/`, `chat` (chats, messages, attachments, the assistant's reply,
  the title, the chat's and the message's `Status`) and `identity` (the user, the user secret,
  recognising who sent a request); and `use-cases`, one workspace above the modules holding every
  use case, so a flow that spans modules is a plain use case and no module imports another. A
  module contract is its own workspace in the module's folder, created with its first consumer:
  today `identity-contract`, holding `UserId`, `UserUnknownError`, `CurrentUser` and `Auth`.
- The kernel, `kernel/*`: the application's foundation configured for this app, with no business
  rule and no knowledge of a module, each package declaring whether it runs in the browser (none
  does today): `kernel-config` and `kernel-aws` (moved
  from `packages/`), `kernel-db` (the client over `DatabaseConfig`, the migrations, the e2e
  database), `kernel-queue` (the SQS consumer and relay over the stage and `QueueConfig`),
  `kernel-llm` (the provider chosen by `LlmConfig`).
- `packages/*` holds only what is configurable and knows no app, with no exception: the new `db`
  (the Drizzle client over `PgClient`, the transaction, the columns, the migrator) and `outbox` (a
  table factory, the sender, the relay), and `llm` gains the provider builders now in chat's
  `assistant.client.ts`, so chat keeps only `AssistantLlm` with its prompts.
- `http-api` keeps every HTTP group and assembles the contract (health, the groups, the schema
  error middleware); it holds the chat's limits and attachment errors; `apps/api` and
  `apps/worker` keep the handlers. A module exports its services and adapters as layers.
- One Postgres schema per module: `chat` (with its outbox) and `identity`; the journal stays in
  `drizzle`. One migration moves the existing tables and drops the two foreign keys to `users`.
- The guards: package `exports`, the isolated linker, `tsc -b` project references, one Biome
  override per layer over every module, the bundle check rewritten for modules; each Biome
  failure names the decision it protects. What no tool's configuration can express (a cycle of
  modules through their contracts, table ownership in the database) is a rule the review checks,
  never hand-written test code.
- A living decisions document with the principles from the research, a pointer to it in
  `CLAUDE.md`; every `docs/knowledge/` and `CLAUDE.md` file the move touches, the glossary and the
  roadmap.

## Out of scope

- A `drive` module for files: split from `chat` in `shared-files` (16), which inherits the shape
  (chat owns the message–file link with a metadata copy).
- A use case that spans modules: none exists today; the docs show its shape.
- The job ledger's statuses: `job-ledger` (22).
- Postgres roles per module schema: a role and a pool per module for what a test already checks.
- `apps/web` beyond import paths.

## Requirements

### Behaviour kept

- **R1** — WHEN a client calls any endpoint that exists before the ticket, THE SYSTEM SHALL answer
  with the same status, body and errors as before.
- **R2** — WHEN a message is sent, THE SYSTEM SHALL produce the assistant's reply and the chat's
  title through the same jobs, queues, attempts and dead letter as before.
- **R3** — WHEN a chat is deleted, THE SYSTEM SHALL delete its messages, its attachments and their
  stored bytes, as before.
- **R4** — WHEN the migrations run on a database migrated before the ticket, THE SYSTEM SHALL
  move every table and enum into its owning module's schema, keeping every row, index, foreign
  key inside a module and cascade, and SHALL drop only the two foreign keys from the chat's tables
  to the user's table.
- **R5** — WHEN the migrations run on an empty database, THE SYSTEM SHALL produce the same
  schemas, tables and constraints as R4, and a new migration generated afterwards SHALL be empty.

### Structure

- **R6** — THE SYSTEM SHALL consist of the modules chat and identity and the use cases above
  them, a kernel of packages
  configured for this app with no business rule, `packages/*` that are configurable and know no
  app, the HTTP contract, and the processes that assemble them.
- **R7** — THE SYSTEM SHALL let a module reach another module only through that module's
  contract, which holds no implementation.
- **R8** — THE SYSTEM SHALL keep inside each module the domain and infrastructure layers and
  their import direction, and SHALL keep every use case in the use-case workspace above the
  modules.
- **R9** — THE SYSTEM SHALL keep every table, enum, trigger and Drizzle relation in the schema of
  its one owning module, with no foreign key, relation or trigger that reaches another module's
  table.
- **R10** — WHEN a module enqueues a job, THE SYSTEM SHALL write it to that module's own outbox in
  the transaction of the writes the job reads.

### Guards

- **R11** — IF code imports another module's internals, a module from outside the use cases, the
  processes, the HTTP contract and the journey test, the use cases from inside a module, or a
  workspace its package does not declare, THEN `make check` SHALL fail, naming the import and the
  decision it breaks.
- **R12** — IF the workspaces form a cycle, or the kernel or a generic package imports a module,
  THEN `make check` SHALL fail; IF the modules form a cycle once a dependency on a module's
  contract counts as one on the module, THEN review SHALL refuse it by the modules rule.
- **R13** — IF a module's code declares a foreign key or a relation to another module's table,
  THEN `make check` SHALL fail as an import of another module's internals; IF a module declares a
  table, an enum or a trigger outside its own schema, or a migration adds a foreign key or a
  trigger that reaches another module's table, THEN review SHALL refuse it by the modules rule.
- **R14** — IF a module's domain or a module contract imports a kernel package that does not run
  in the browser, a kernel package imports a module or a contract, or a package under `packages/*`
  imports the kernel, THEN `make check` SHALL fail, naming the import and the decision.
- **R15** — IF a service, a port or an adapter of any module reaches the browser's bundle, THEN
  `make check` SHALL fail.

### Rules, docs and decisions

- **R16** — WHERE a flow needs several modules, THE SYSTEM SHALL run it as one use case that
  calls each module's services synchronously and MAY commit their writes in one transaction; a job
  SHALL carry only work that outlives a request (the assistant's reply, the title), never a
  module's reaction to another module's write.
- **R17** — WHEN the ticket lands, THE SYSTEM's docs SHALL describe the module map, the dependency
  rules, how to add a module, how to add an entity to a module, and the shape of a use case that
  spans modules, and SHALL name no path, package or term that no longer exists.
- **R18** — WHEN the ticket lands, every architecture decision of the ticket SHALL be recorded in
  the living decisions document with its reason and sources, the rejected alternatives, its costs,
  what guards it, what breaks if it is reversed and when to revisit it; WHEN a session is asked to
  change a module boundary, the kernel, a guard or a recorded decision, the project's instructions
  SHALL direct it to read that decision and state the consequences before changing anything.

## Acceptance

| Req | How to verify |
|---|---|
| R1 | `make test-unit` and `make test-e2e` pass with tests changed only in import paths, raw SQL schema prefixes and the setup that existed only for the foreign keys to `users`; the HTTP contract's OpenAPI document is identical before and after |
| R2 | the journey e2e passes: a sent message gets its reply and its title; the worker's handler tests pass unchanged but for import paths |
| R3 | the delete-chat e2e passes: messages and attachments are gone and the bucket holds none of their objects |
| R4 | on a database migrated by `main`'s migrations and seeded with a row per table, `make migrate` keeps every row; `\d` shows the tables in `chat` and `identity`, the in-module foreign keys and cascades, and no foreign key from `chat` to `identity.users` |
| R5 | `make migrate` on an empty database, then `make migration-check`, reports no change |
| R6 | the workspace list shows the two modules, `identity-contract`, `use-cases`, the kernel packages, the packages, `http-api` and the three apps, and no `domain` or `infrastructure` workspace |
| R7 | grep: no module's code imports another module's package other than its contract |
| R8 | each module holds only `domain/` and `infrastructure/` (with their tests and test support); every `*.use-case.ts` lies under `application/use-cases/`; the layer overrides pass |
| R9 | review against the modules rule finds no table, enum, trigger or relation outside its owner's schema; `psql \dn` lists `chat`, `identity`, `drizzle` and nothing else in use |
| R10 | the send-message e2e finds the job in `chat`'s outbox and rolls back both on a failed write |
| R11 | a throwaway import of another module's internals, and one of an undeclared workspace, each fail `make check` with the import and the decision named |
| R12 | a throwaway import of a module into the kernel and into a generic package each fail `make check` with the decision named; the modules rule names the contract cycle and its decision |
| R13 | a throwaway relation to another module's table fails `make check`; the modules rule names the wrong schema, the cross-module foreign key and trigger, and their decision |
| R14 | throwaway imports of `kernel-db` into a module's domain and into a contract, of a module into `kernel-db`, and of `kernel-config` into a package each fail `make check` with the decision named |
| R15 | `make bundle-check` passes; a throwaway import of a module's service into the web app makes it fail |
| R16 | the decisions document and `architecture.md` show a use case spanning modules with a short snippet; grep finds no job whose handler reacts to another module's write |
| R17 | `make doc-names` passes; `architecture.md` has the five sections; the glossary has "Application", "Module", "Module contract", "Kernel", "Package" and bans "Component" |
| R18 | every decision below has a record with the seven fields; every Biome guard's message and every review rule names a record that exists; `CLAUDE.md` holds the pointer |

## Decisions from the grilling

Each becomes a record in the decisions document (R18) and a `D…` in `architecture.md`.

- **Q1** — ticket `modular-monolith`, branch `refactor/modular-monolith` from `main`, roadmap 23.
- **Q2** — the unit is a "Module" (`modules/`); "Component" and "core" are banned.
- **Q3** — two modules; attachments stay in `chat`, since splitting them now makes the coupling
  two-way (8 + 3 files), the send's bind a cross-module transaction and the cascade a
  cross-module delete. `shared-files` (16) splits a `drive` module (Q31).
- **Q5** — behaviour does not change; tests change only import paths, raw SQL schema prefixes and
  the setup that existed only for the foreign keys to `users` (architecture grilling, 2026-10-31).
- **Q6, Q15** — a Postgres schema per module; across modules a plain id column, no foreign key,
  a conscious trade-off against Exasol's "define foreign keys for all persistent relationships";
  the two foreign keys to `users` go, their columns stay.
- **Q9, Q28** — the guards are `exports`, the isolated linker, `tsc -b` and Biome; no
  dependency-cruiser. A cycle through contracts passes `tsc -b`, and table ownership in the
  database passes every tool: both are a rule the review checks, not hand-written test code
  (architecture grilling, 2026-10-31; replaces the ownership and module-cycle tests).
- **Q10** — one database client and transaction; each module declares its own typed Drizzle over
  its tables; one `Db` over every table would need a cycle.
- **Q11** — `Auth`, `CurrentUser`, `UserId` and `UserUnknownError` live in `identity-contract`.
- **Q12, Q24** — a module contract arrives with its first consumer; facades and reactions between
  modules are gone (architecture grilling, 2026-10-31: use cases above the modules).
- **Q13** — a module contract is its own workspace; modules depend on contracts only.
- **Q16** — a module holds only `domain/` and `infrastructure/`; every use case sits in
  `application/use-cases` (architecture grilling, 2026-10-31).
- **Q17, Q26** — HTTP groups stay in `http-api` and handlers in the apps, since a module's handler
  needs the assembled `Api` while the `Api` imports the groups: a cycle. `RequestInvalidError` and
  `RequestIssue` stay in `http-api`, since no module raises them, only `http-api`, `apps/api` and
  `apps/web`; the chat's limits and attachment errors stay with the groups too. `generateId` goes:
  its five callers spell `crypto.randomUUIDv7()` with the brand's `make` (architecture grilling,
  2026-10-31).
- **Q18, Q22** — the user's module is `identity` (a capability; `user` is reserved in Postgres);
  the schemas are `chat` and `identity`; the journal stays in `drizzle`.
- **Q19, Q32** — every doc the move touches is updated; the decisions live in a living document
  that `CLAUDE.md` points to and every guard names.
- **Q20** — `apps/web` changes only import paths.
- **Q27** — a flow that spans modules is a use case in `application/use-cases`, synchronous and
  allowed one transaction; a job carries only work that outlives a request. Replaces Q7, Q21 and
  the audit's facade-and-reaction answer (architecture grilling, 2026-10-31: one debuggable path
  from the request instead of request → event → job handler).
- **Q29** — `packages/*` is configurable and knows no app; the kernel is the same tools
  configured for this app (config, resources, clients, migrations), with no
  business rule and no module; each kernel package declares whether it runs in the browser; each
  sending module owns its outbox. Replaces Q23 and the audit's browser-only kernel (architecture
  grilling, 2026-10-31).
- **Q30** — `Status` belongs to `chat`; `job-ledger` (22) gets its own job vocabulary. Replaces Q8.

## Audit (2026-10-31)

An audit against the Guild guide, the modular-monolith articles of awesome-software-architecture,
Exasol's design principles, the Neon tutorial, the PostgreSQL docs and awesome-postgres, and a
stress test of ten roadmap scenarios on the code. Its answers are folded into the scope, the
requirements and the decisions above.

- **Q26** — yes: HTTP groups stay in `http-api`, handlers in `apps/api`; a module exports its
  services and adapters. A module's api layer importing `Api` while `http-api` imports the module's
  group is a package cycle (`HttpApiBuilder.group(Api, …)`, `apps/api/chat/chat.handler.ts:14-16`).
  Q25 is closed.
- **Q27** — A: a question is a read-only facade; a reaction is a job in the writer's outbox; a
  write inside another module's transaction only as a time-boxed `Decision:`. Replaces Q21's B.
  The user's concern, a failure between the writer's commit and the reaction: the job commits with
  the write, the relay and the queue retry, the dead letter retries without end at most five
  minutes apart (`infrastructure/chat/chat.queue.ts`), the handler tolerates a second delivery,
  and the window is invisible because the deleted user no longer passes `Auth`; S3 sits outside
  any transaction even today.
- **Q28** — a cycle stays possible after Q27-A; the architecture grilling (2026-10-31) leaves it
  to the review rule rather than a test, see Q9.
- **Q32** — yes: a living decisions document, a pointer in `CLAUDE.md`, and guard messages that
  name the decision (R18).
- **Q29** — A: the kernel keeps only pure, browser-safe parts (the id format,
  `RequestInvalidError`); the database client and transaction, the outbox and relay, the test
  harnesses go to generic `packages/*`; the outbox is a table factory, each sending module owns its
  outbox in its schema. Replaces Q23.
- **Q30** — A: `Status` moves to `chat`; `job-ledger` (22) gets a job vocabulary of its own.
  Replaces Q8.
- **Q31** — yes: recorded in `shared-files` (16): chat owns the message–file link with a metadata
  copy; `drive` owns the pool and the bytes.
- **Minor, into the requirements:** `make bundle-check` greps `domain|infrastructure` paths
  (`Makefile:230-233`) and needs a new pattern; one Biome override per layer over `modules/*/…`,
  workspace globs and an add-a-module checklist; no foreign key across modules is a conscious
  trade-off against Exasol's "define foreign keys for all persistent relationships"; Postgres
  roles per schema rejected (a role and a pool per module); `SET SCHEMA` takes `ACCESS EXCLUSIVE`
  but rewrites nothing, so a deployed run sets `lock_timeout`; a field from another module is
  filled by a batch facade call in the use case.
