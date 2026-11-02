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

The code is organised around its data. The data layer, `kernel/data`, is the one source of truth
over every store: every table, relation and stored object with its repository, in its own words,
importing only `packages/*` and taking its clients (Postgres, S3) from the context. Around it the
behaviour: one module per business capability (`chat`, `identity`) with its models, rules and
domain services, reachable from another module only through its module contract, a package with
no implementation; above the modules, every use case. Around both the boundary: the kernel's
configured clients (config, Postgres, AWS, queue, language model), the HTTP contract and the
processes, which provide the clients. Dependencies point inward only, and the build, not review,
rejects an import that points outward, into another module's internals, or round a cycle.
Behaviour seen from outside does not change.

## Context

- **Research (2026-10-30).** The Software Architecture Guild guide (styles, boundaries, domains,
  validation) and Spring Modulith, kgrzybek/modular-monolith-with-ddd, Packwerk, Nx and
  dependency-cruiser: [research.md](./research.md).
- **Guards available in this repo (verified 2026-10-30).** Biome 2.5.15 `noRestrictedImports`
  catches `import`, `export * from` and `export { x } from`; one override on a path with the group
  `@app-template/*`, `@app-template/**` and negations for the allowed packages bans every other one
  (without `**`, a deep path passes). tsgo 7.0.2 refuses circular project references (TS6202).
  `bunfig.toml` sets `linker = "isolated"`, so an undeclared workspace fails with TS2307. The
  `typescript` JS API is absent (TS 7 is native), so dependency-cruiser would need another parser.
- **The code today (researcher, 2026-10-30 and 2026-10-31).**
  - The only flow writing several tables in one transaction is the send of a message: `chats`,
    `messages`, `attachments` (bind) and `outbox`. Nothing but the user's own code writes `users`
    or `credentials`; no code updates or deletes a user, whose group has one endpoint,
    `POST /users`.
  - Foreign keys: `chats.user_id → users.id` and `attachments.user_id → users.id` (no action);
    `credentials.user_id → users.id`, `messages.chat_id → chats.id` and `attachments (message_id,
    chat_id) → messages (id, chat_id)` cascade. No triggers. Deleting a chat cascades to its
    messages and attachments, and the chat service deletes the bytes by the ids it read.
  - `chat` ↔ `attachment` is two-way: 8 files of chat import attachment, 3 of attachment import
    chat. The user's code is 262 lines, its only rules `ensure` and `authenticate`, and it imports
    nothing of chat or attachment.
  - Chat needs of the user only `UserId` (about 20 files); chat's HTTP side also needs `Auth`,
    `CurrentUser` and `UserUnknownError`. All four import only `effect`, and the browser loads them
    through the HTTP contract.
  - `RequestInvalidError` and `RequestIssue` are raised only by `http-api`, `apps/api` and
    `apps/web`; the limits and the two attachment errors serve only the chat and attachment groups.
  - `Status` is used only by the chat and the message. The outbox carries two queues,
    `assistantMessage` (with a dead letter) and `chatTitle`, both chat to chat; its sender inserts
    into it and its relay selects the unsent rows `for update skip locked` and sets `sent_at`
    (`infrastructure/outbox/outbox.relay.ts:38`).
  - The bucket sits outside every transaction: `bind` removes the `unbound` tag before it updates
    the rows (`domain/attachment/attachment.service.ts:183-185`), as `layering.md` requires. The
    bucket's adapter already takes `S3Bucket` from the context
    (`infrastructure/attachment/attachment.bucket.ts:29`); only `S3BucketFromConfig` reads the
    stage. The tag is shared with the bucket's expiration rule (`deployment/aws/storage.ts:22`).
  - Every `*.entity.ts` imports the domain: the row codecs decode into the models
    (`ChatFromRow`), the enums take the models' literals (`ChatStatus.literals`), and three checks
    take a domain value (`chats_title_check`: `maxTitleLength`; `attachments_media_type_check`:
    `mediaTypePattern`; `credentials_hash_check`: `secretHashPattern`); the partial unique index
    `messages_chat_id_active_index` takes `ActiveMessageStatus.literals`. The repositories
    implement the domain's ports (`chat.repository.ts:5`).
  - Vitest picks the unit tests by `**/tests/**/*.test.ts` and the e2e by `**/e2e/**/*.e2e.ts`
    (`vitest.config.ts`); 79 files sit in a `tests/`, `e2e/` or `testing/` folder.
  - `user` is a reserved word in Postgres.
  - The app is not in production: the schema has two migrations (`init`, `outbox_sent_at`), and
    `make reset` removes the database's container and volume.
- **Roadmap.** Entry 23; `shared-files` (16), `assistant-files` (18) and `jobs` (22) depend
  on it.

## Scope

- **The data layer**, `kernel/data` (`@app-template/kernel/data`, one entry for every store):
  `Db` over every
  table and relation, the migrations and the drizzle-kit config, every table, enum, index and
  relation, the repositories with their own `<Name>Entity`, `<Name>EntityInsert`,
  `<Name>EntityWhere` and `<Name>EntitySet`, `JobRepository`, and `FileRepository` over the
  attachments' objects (today's keys `attachments/<id>` and the `unbound` tag), with memory twins
  for unit tests. It imports only `packages/*`; its clients (`PgClient`, `S3Bucket`) come from the
  context. The tables stay in `public` with today's foreign keys and checks; since the app is not
  in production, the migrations restart as one initial migration and the table `outbox` becomes
  `jobs`.
- **The behaviour**, `application/`: two modules, `chat` (chats, messages, attachments, the
  assistant, the title, `Status`) and `identity` (the user, the user secret, recognising who sent a
  request), each a workspace with `domain/` (models, pure rules, errors, the ports that reach
  outside; ships to the browser), `services/` (domain services, the mappers between an entity and a
  model, the job definitions) and, once it has an adapter, `infrastructure/` (chat's assistant with
  its prompts). The module contract, identity's `contract/` folder exported through its entry, holds `UserId`, `UserUnknownError`,
  `CurrentUser` and `Auth`. Every use case lives in `application/use-cases`
  (`@app-template/application/use-cases`), above the modules.
- **The boundary**: the kernel, one workspace with the parts `config`, `postgres`, `aws` (with the
  inventory), `queue` and `llm` beside `data`, holding this app's
  configuration of its tools (the clients built from config, the AWS inventory, the migrate entry,
  the queue's sender, consumer and relay) and no service rule; `http-api`, which keeps every HTTP
  group; the apps, which keep the handlers, assemble the layers and provide the clients.
- `packages/*` holds only what is configurable and knows no app: the new `db` (`createDb`,
  `Transaction`, the columns, `generateId`, the migrator), `aws` reduced to the generic provisioner, and `llm`
  with the provider builders now in chat's `assistant.client.ts`.
- **Tests**: every workspace keeps its unit tests in `__tests__/` with their support in
  `__tests__/testing/`, the support only the e2e use in `__tests__/testing/e2e/`, and its e2e
  tests in `__e2e__/`; a unit test never imports `testing/e2e`. `application`
  holds unit tests only, its mappers' among them over the schemas (amended in S31 and S34); the
  e2e over the processes live in the test app `apps/e2e` (`@app-template/e2e`, today's `e2e/`
  workspace, amended in S35): the journey and the use cases' races and
  rollbacks, each a request to the api with the worker in the same runtime, never a use case
  called directly.
- **Imports by folder path** (added 2026-11-02, after verification): a part of the kernel, a
  package under `packages/*` and a workspace under `application/` are imported by their folder,
  `@app-template/<folder>` (`@app-template/application/chat`, `@app-template/packages/db`,
  `@app-template/kernel/data`): `packages/` and `application/` each become one workspace, like
  the kernel, whose `exports` give each unit one entry, its `index.ts`, and its test support,
  `<folder>/testing` (`<folder>/testing/e2e` for what only the e2e use); the apps and `http-api`
  keep their package names.
- The guards: package `exports`, the isolated linker between workspaces, `tsc -b` project
  references, a Biome override per layer and a GritQL plugin that refuses another unit's files,
  the bundle check rewritten; each Biome failure names the decision it protects. What no configuration expresses (a cycle of modules through their
  contracts, a service rule in the kernel) is a review rule, never hand-written test code.
- Names: the data layer's types end in `Entity`; the word names nothing else, and the domain's
  records are models.
- A living decisions document with the principles from the research and this ticket, a pointer to
  it in `CLAUDE.md`; every `docs/knowledge/` and `CLAUDE.md` file the move touches, the glossary
  and the roadmap.

## Out of scope

- A `drive` module for files: split from `chat` in `shared-files` (16).
- A use case that spans modules: none exists today; the docs show its shape.
- The jobs' statuses: `jobs` (22).
- A Postgres schema, a Drizzle or a role per module.
- `apps/web` beyond import paths.

## Requirements

### Behaviour kept

- **R1** — WHEN a client calls any endpoint that exists before the ticket, THE SYSTEM SHALL answer
  with the same status, body and errors as before.
- **R2** — WHEN a message is sent, THE SYSTEM SHALL produce the assistant's reply and the chat's
  title through the same jobs, queues, attempts and dead letter as before.
- **R3** — WHEN a chat is deleted, THE SYSTEM SHALL delete its messages, its attachments and their
  stored bytes, as before.
- **R4** — WHEN the migrations run on an empty database, THE SYSTEM SHALL apply one migration
  and produce the same tables, enums, indexes and constraints as before, but the table `outbox`
  named `jobs`.
- **R5** — WHEN a migration is generated from the data layer after the ticket, THE SYSTEM SHALL
  generate none.

### Structure

- **R6** — THE SYSTEM SHALL consist of the data layer at the centre, the modules chat and identity
  with the use cases above them, and a boundary of the kernel's configured clients, the HTTP
  contract and the processes, with `packages/*` that are configurable and know no app.
- **R7** — THE SYSTEM SHALL let a module reach another module only through that module's
  contract, which holds no implementation; review holds which names of the module's entry are
  its contract.
- **R8** — THE SYSTEM SHALL keep inside each module the layers `domain`, `services` and
  `infrastructure` and their import direction, and every use case in the use-case workspace.
- **R9** — THE SYSTEM SHALL declare every table, enum, index, relation, stored object and
  repository in the data layer, in its own types, so that the data layer imports only
  `packages/*` and takes its clients from the context.
- **R10** — WHEN a use case enqueues a job, THE SYSTEM SHALL write it to the table `jobs` in the
  transaction of the writes the job reads.
- **R11** — THE SYSTEM SHALL keep a workspace's unit tests and its test support under
  `__tests__/`, with the support only the e2e use under `__tests__/testing/e2e/`, and its e2e
  tests under `__e2e__/`, SHALL keep the e2e of the whole system in the test app `apps/e2e`,
  which starts no process and holds its own support, SHALL keep in `packages/testing` only the support several units share,
  SHALL run from `application` unit tests alone, and
  SHALL drive the use cases' e2e through requests to the api, from `apps/e2e/api/`.
- **R21** — THE SYSTEM SHALL import a part of the kernel, a package under `packages/*` and a
  module or the use cases under `application/` by its folder path, `@app-template/<folder>`, through one entry,
  its `index.ts`, and its test support through `@app-template/<folder>/testing` and
  `@app-template/<folder>/testing/e2e`; the apps and `http-api` SHALL keep their package names.

### Guards

- **R12** — IF code imports another module's internals, THEN `make check` SHALL fail, naming the
  import and the decision it breaks; IF code imports a workspace its manifest does not declare,
  THEN `make check` SHALL fail with TS2307, naming the import.
- **R13** — IF the workspaces form a cycle, or the kernel or a generic package imports a module or
  a contract, THEN `make check` SHALL fail; IF the modules form a cycle once a dependency on a
  module's contract counts as one on the module, THEN review SHALL refuse it by the modules rule.
- **R14** — IF the data layer imports a module, a contract or another part of the kernel, THEN
  `make check` SHALL fail, naming the decision.
- **R15** — IF a module's domain or a contract imports the kernel, a module's services import the
  kernel's boundary or the module's own infrastructure, or a use case imports the kernel's
  boundary (every layer of a module below it is open to it), THEN `make check` SHALL fail, naming
  the import and the decision; IF a package under `packages/*` imports the kernel, THEN
  `make check` SHALL fail with TS2307.
- **R16** — IF a service, a use case, a repository or an adapter reaches the browser's bundle, THEN
  `make check` SHALL fail.
- **R17** — IF a unit test builds e2e support (`testing/e2e`), THEN `make test-unit` SHALL fail;
  IF a unit test imports e2e support it never builds, THEN review SHALL refuse it by the modules
  rule.

### Rules, docs and decisions

- **R18** — WHERE a flow needs several modules, THE SYSTEM SHALL run it as one use case that
  calls each module's services synchronously and MAY commit their writes in one transaction; a job
  SHALL carry only work that outlives a request (the assistant's reply, the title), never a
  module's reaction to another module's write.
- **R19** — WHEN the ticket lands, THE SYSTEM's docs SHALL describe the three rings, the
  dependency rules, how to add a module, how to add an entity (its data and its model), how to add
  a store's client, where tests live, and the shape of a use case that spans modules, and SHALL
  name no path, package or term that no longer exists.
- **R20** — WHEN the ticket lands, every architecture decision of the ticket SHALL be recorded in
  the living decisions document with its reason and sources, the rejected alternatives, its costs,
  what guards it, what breaks if it is reversed and when to revisit it; WHEN a session is asked to
  change a module boundary, the data layer, the kernel, a guard or a recorded decision, the
  project's instructions SHALL direct it to read that decision and state the consequences before
  changing anything.

## Acceptance

| Req | How to verify |
|---|---|
| R1 | `make test-unit` and `make test-e2e` pass with every case and assertion kept; the HTTP contract's OpenAPI document is identical before and after |
| R2 | the journey e2e passes: a sent message gets its reply and its title; the worker's handler tests pass unchanged but for import paths |
| R3 | the delete-chat e2e passes: messages and attachments are gone and the bucket holds none of their objects |
| R4 | `make reset`, then `make up`, applies one migration; `pg_dump --schema-only` of it, diffed against one of `main`'s, shows only `outbox` renamed `jobs` |
| R5 | `make migration-check` reports no change |
| R6 | the workspace list shows `kernel`, `application` (the two modules with identity's contract folder, and the use cases), `packages`, `http-api`, the three apps and the test app at `apps/e2e`, and no `domain` or `infrastructure` workspace |
| R7 | review finds no module importing from another module's entry a name outside its contract; `.claude/rules/modules.md` names the check and links its record |
| R8 | each module holds only `domain/`, `services/`, `infrastructure/`, its `contract/` once another module needs one, `__tests__/` and its entry `index.ts`, and no `__e2e__/`; every `*.use-case.ts` lies under `application/use-cases/`; the layer overrides pass |
| R9 | grep: no source file under `kernel/data/` (outside its `__tests__/` and `__e2e__/`) imports `@app-template/*` but a package under `packages/*`, or `#kernel/*` outside `#kernel/data`; its e2e and their support take of the kernel only the inventory (`@app-template/kernel/aws`, with its e2e support) and `@app-template/kernel/config`, to build the stores' clients; every `*.table.ts`, `*.entity.ts` and `*.repository.ts` lies under `kernel/data/` |
| R10 | a send through the api leaves its job in `jobs`, and a refused write keeps neither the job nor the writes |
| R11 | `git ls-files` finds no `tests/`, `e2e/` or `testing/` folder outside `__tests__/` and `__e2e__/` (but the package `packages/testing`, the test app `apps/e2e` and its `apps/e2e/testing`), no `__e2e__/testing/` under `kernel/` or `packages/`, no `aws`, `postgres` or `rows` support in `packages/testing`, no `__e2e__/` under `application/`, no `apps/__e2e__`, and no suite under `apps/e2e` that reads a use case or a mapper from the context |
| R12 | a throwaway import of another module's internals, in each import form, fails `make check` with the import and the decision named; one of a workspace its manifest does not declare fails it with TS2307 |
| R13 | a throwaway import of a module into the kernel and into a generic package each fail `make check` with TS2307, and a cycle of value imports between two modules with `noImportCycles`; the modules rule names the contract cycle and its decision |
| R14 | throwaway imports of a module's model, of `#kernel/aws` and of `@app-template/kernel/config` into a data-layer file each fail `make check` with the decision named |
| R15 | throwaway imports of the kernel into a module's domain and into a contract, of `@app-template/kernel/llm` and of the module's infrastructure into its services, of `@app-template/kernel/postgres` into a use case (a module's infrastructure in a use case passes), each fail `make check` with the decision named, and one of the kernel into a package with TS2307 |
| R16 | `make bundle-check` passes; throwaway imports of a module's service, of a use case and of a repository into the web app each make it fail |
| R17 | a throwaway unit test that builds e2e support from `@app-template/kernel/data/testing/e2e` fails `make test-unit`, which starts no database; the modules rule names an import of e2e support into a unit test and its decision |
| R21 | `git grep` finds no import of `@app-template/<name>` for a unit of `kernel`, `packages` or `application` but by its folder, and none of a layer or store subpath; `make check` passes |
| R18 | the decisions document and `architecture.md` show a use case spanning modules with a short snippet; grep finds no job whose handler reacts to another module's write |
| R19 | `make doc-names` passes; `architecture.md` has the seven sections; the glossary has "Application", "Module", "Module contract", "Use case", "Kernel", "Data layer", "Entity", "Model", "Boundary" and "Package" and bans "Component" |
| R20 | every decision of `architecture.md › Decisions` has a record with the seven fields; every Biome guard's message and every review rule names a record that exists; `CLAUDE.md` holds the pointer |

## Decisions

Settled with the user on 2026-10-31, after the research, an audit and the plan review;
`architecture.md › Decisions` holds each with its reason, cost and rejected alternatives.

- The ticket is `modular-monolith`, branch `refactor/modular-monolith` from `main`, roadmap 23; the
  unit is a "Module", and "Component" and "core" are banned.
- **The data is the centre.** `kernel/data` holds every store (tables, relations, the attachments'
  objects) and its repositories in its own types, imports only `packages/*` and takes its clients
  from the context; the processes provide them. Tables stay in `public` with today's foreign keys
  and checks. Every module may read and write any record through it.
- **A table is not an entity.** A store's table lives in `<name>.table.ts` and imports only
  tables; its entity, the schema every read returns, lives in `<name>.entity.ts`, so `ChatEntity`
  and `MessageEntity` nest their attachments. A module's mapper lays the models' schemas over the
  entity's fields.
- **Two modules**, `chat` and `identity`; attachments stay in `chat` until `shared-files` (16). A
  module is `domain/`, `services/` and `infrastructure/`; a repository is no port. `identity`
  is reachable only through its contract (a folder behind identity's entry since S29); no events, facades or reactions between modules.
- **Every use case lives in `application/use-cases`**, above the modules, synchronous, one
  transaction whatever modules it touches.
- **One kernel workspace** with subpaths for config, Postgres, AWS (with the inventory), queue,
  language model and data; `packages/*` is configurable and knows no app.
- **A fresh schema**: the app is not in production, so the migrations restart as one initial
  migration, and the table `outbox` becomes `jobs` now rather than in `jobs` (22).
- **Jobs** are `JobRepository` in the data layer over the table `jobs`; `QueueSenderJobs`, the
  consumer and the relay live in `kernel/queue` over it, composed by layers.
- **Files** are `FileEntity` and `FileRepository` in the data layer, over the `S3Bucket` the
  boundary binds to the stage's bucket; the data layer declares the key and the `unbound` tag, the
  inventory the bucket's name and lifecycle.
- **HTTP groups stay in `http-api`**, handlers in the apps; `generateId` moves to `packages/db`; `Status` belongs to
  `chat`.
- **Tests** sit in `__tests__/` and `__e2e__/` per workspace, each with its `testing/`; an e2e
  suite may import `__tests__/testing`, never the reverse; `application` has unit tests alone,
  and the e2e through the api live in the test app `apps/e2e`.
- **Guards** are configuration (`exports`, the isolated linker, `tsc -b`, Biome, the bundle
  check) plus one review rule, never hand-written test code; the decisions live in
  `docs/knowledge/decisions.md`.
- **Imports by folder path** (settled 2026-11-02, after verification): `packages/` and
  `application/` each become one workspace, like the kernel, so the kernel's parts, the packages,
  the modules and the use cases are imported as `@app-template/<folder>`, one `index.ts` and one
  `/testing` each, by their `exports`, with no `paths` alias; a GritQL plugin tells the units
  inside one workspace apart, which the linker cannot; a use case may import any layer of a
  module below it; e2e support sits in `__tests__/testing/e2e/`, imported as
  `<folder>/testing/e2e`, which a unit test may not import.
