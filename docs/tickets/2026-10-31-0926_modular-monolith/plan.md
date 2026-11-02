# Modular monolith — plan

> Ticket: `2026-10-31-0926_modular-monolith` · Requirements: [feature.md](./feature.md) · Design: [architecture.md](./architecture.md)

## Status

| Step | Delivers | Status |
|---|---|---|
| S1 | tests in `__tests__/` and `__e2e__/` everywhere; the e2e over assembled layers in `apps/api` | done |
| S2 | `generateId` in `packages/db`, beside the `id()` column | done |
| S3 | the use cases in `application/use-cases` | done |
| S4 | the `kernel` workspace with `/config` and `/aws`; `packages/aws` a generic provisioner | done |
| S5 | `packages/db`: the generic Drizzle client, transaction and migrator | done |
| S6 | `kernel/postgres` and the migrations in `kernel/data` | done |
| S7 | `kernel/llm` picks the provider; chat keeps only its prompts | done |
| S8 | the tables and relations in `kernel/data`, in the data layer's own types | done |
| S9 | `Db` in `kernel/data` over the `PgClient` in the context; the entity suites speak entities | done |
| S10 | the table `jobs` and `JobRepository`; one initial migration; the queue in `kernel/queue` | done |
| S11 | the `identity` module and `identity-contract` | done |
| S12 | `UserRepository` in the data layer; the first port gone | done |
| S13 | chat's domain and services in `application/chat`; no `domain` workspace | done |
| S14 | `ChatRepository` and `MessageRepository` in the data layer | done |
| S15 | `AttachmentRepository` in the data layer | done |
| S16 | the memory repositories over entities in the kernel's test support | done |
| S17 | chat's services and the use cases over the data layer; the repository ports gone | done |
| S18 | `FileRepository` in the data layer; the bucket port gone | done |
| S19 | chat's assistant in `application/chat/infrastructure`; no `infrastructure` workspace | done |
| S20 | the decisions document and the modules review rule | todo |
| S21 | the Biome guards per ring and layer | todo |
| S22 | `architecture.md` rewritten for the rings | todo |
| S23 | the glossary, the `<Model>` placeholders, the roadmap and the remaining pages | todo |

## How to run this plan

- Branch `refactor/modular-monolith`; one commit per step, after the user's OK (`/ticket-implement`).
- Each step leaves `make check` green and fits one fresh session (≤ ~400 changed lines, counted with
  rename detection, `git diff -M --stat`; `bun.lock` and generated migrations excluded).
- A Verify's `git grep` runs with `':!docs/tickets' ':!repos'`, so the ticket's own docs and the
  vendored repos never match. A step that adds a row to a rule near its ~80-line limit
  (`naming.md`, `effect-tests.md`) trims one beside it.
- A move keeps each file's content but for its imports, aliases and service key, so `git` sees a
  rename. Every step updates the `docs/knowledge/` pages, rules and `CLAUDE.md` files that name a
  path or symbol it moves (`make doc-names` fails otherwise); the narrative rewrite waits for S22.
- Tests keep every case and assertion (D14); a step that changes more says so under Test first.
  A moved suite lands in its workspace's `__tests__/` or `__e2e__/` (S1 sets the layout).
- While the old workspaces remain, they may import the new ones (`infrastructure` imports
  `@app-template/kernel/data/chat`); the reverse is never written. Two interim states: chat's
  ports' adapters delegate to the data layer's repositories from S14 and S15 until S17, and the
  memory repositories over entities wait from S16 for S17.
- A deviation is recorded in the step's findings, and in `architecture.md › Decisions` when it is a
  decision.

## Steps

#### S1 — Tests in `__tests__/` and `__e2e__/`

- **Delivers:** in every workspace the unit tests sit in `__tests__/` with their support in
  `__tests__/testing/`, the e2e tests in `__e2e__/` with their support in `__e2e__/testing/`,
  exported as `./testing` and `./testing-e2e` and aliased `#testing/*` and `#testing-e2e/*`. The
  `e2e` workspace becomes `apps/__e2e__`, together with `application`'s e2e (the use cases on
  Postgres) and their Postgres test layer, so `application` keeps unit tests only. A unit test
  importing e2e support fails `make check`. The same tests run, no more and no fewer.
- **Goal:** one place per kind of test, the behaviour ring tested over memory (R11, R17, D19).
- **Blocked by:** none.
- **Files:** every `tests/`, `e2e/` and `testing/` folder of `domain`, `application`,
  `infrastructure` (with `infrastructure/db/testing/`: `db.test-layer.ts` to `__e2e__/testing/`,
  `transaction.test-fake.ts` to `__tests__/testing/`), `packages/{config,queue,s3}` and
  `apps/{api,worker}` → `__tests__/` or `__e2e__/` (support split by its users: a file any unit
  test imports goes to `__tests__/testing/`); `e2e/**` → `apps/__e2e__/`;
  `application/e2e/chat/*` → `apps/__e2e__/use-cases/`; `application/testing/db.test-layer.ts`
  and `ChatPgTest` of `application/testing/chat.test-layer.ts` → `apps/__e2e__/testing/` (its
  unit layers and `selectAttachments` stay); every `package.json` (`exports`, `imports`) and `tsconfig.json`
  of these; root `package.json` (the `e2e` workspace now under `apps/*`) and `tsconfig.json`; `vitest.config.ts` (`**/__tests__/**/*.test.ts`,
  `**/__e2e__/**/*.e2e.ts`, the `globalSetup` path); `biome.json` (every glob naming `tests/`,
  `testing/` or `e2e/`; a `<workspace>/__tests__/**` override per workspace repeating the
  workspace's bans and refusing `#testing-e2e/**` and `@app-template/*/testing-e2e`, since Biome
  replaces the options of two overrides on one file instead of merging them); `Makefile` (`test-unit`, `test-e2e` help); `bun.lock`;
  `.claude/rules/{naming,effect-tests}.md` (the test folders and the barrels' `./testing`),
  `CLAUDE.md` (Map: `e2e/`), `README.md`, `docs/knowledge/{architecture,tooling,ai,aws,database}.md`,
  `domain/CLAUDE.md`, `infrastructure/CLAUDE.md`, `apps/CLAUDE.md`.
- **Test first:** `config only` — a move: `make test-unit` and `make test-e2e` report the same
  number of tests before and after.
- **Verify:** `make check`; `git ls-files ':!repos' ':!docs' | grep -E '(^|/)(tests|e2e|testing)/' |
  grep -vE '__(tests|e2e)__/'` lists only `packages/testing/`; a throwaway import of `#testing-e2e/…` into a unit test fails `make lint`
  (reverted).
- **Model:** `opus medium`
- **Status:** done
- **Findings:**
  - About 780 changed lines against the ~400 limit, the user's choice to keep one step: some 250
    are the `__tests__/**` overrides in `biome.json`, each repeating its workspace's bans as the
    Files list asks; splitting the move from the guard would have left R17 unguarded between them.
  - The *Verify* grep matched every `__tests__/testing/` and `__e2e__/testing/` and could never
    pass; it now filters them out.
  - `application` exports `ChatServices` from `./testing`, so `ChatPgTest` in
    `apps/__e2e__/testing/` composes the same services instead of copying them.
  - R17 half met: the Biome message explains the ban but names no decision, since `make ids`
    refuses decision ids outside `docs/tickets`; S21 names the `decisions.md` record. `apps/__e2e__`
    has no Biome override of its own, as `e2e/` had none; S21's per-ring overrides cover it.
  - Round S1.2: `apps/CLAUDE.md` says `apps/__e2e__` is not an app, so its imports of `api/layer`
    and `worker/layer` do not read as breaking "Apps never import each other".

#### S2 — `generateId` in the database package

- **Delivers:** `generateId(crypto, make)` moves from `domain/shared/id.ts` to `@app-template/db`,
  beside the `id()` column whose default is `uuidv7()`, so the id format lives in one file. Its
  five calls (the send-message use case twice, the chat handler, the attachment and user services)
  import it from there. Ids look and behave as before.
- **Goal:** no shared helper in the domain that the modules would import from each other; one id
  maker given the brand, as `deep-modules.md` asks (D10).
- **Blocked by:** S5.
- **Files:** `domain/shared/id.ts` → `packages/db/id.ts`; `domain/shared/index.ts`,
  `packages/db/index.ts`; `application/use-cases/chat/send-message.use-case.ts`,
  `apps/api/chat/chat.handler.ts`, `domain/attachment/attachment.service.ts`,
  `domain/user/user.service.ts`, with `domain/{package.json,tsconfig.json}` (+ `@app-template/db`);
  `biome.json` (the `domain/**` override allows `@app-template/db` in a `*.service.ts` only, or
  the services' override does once S11 and S13 move them); `.claude/rules/naming.md` (its
  `generateId` example of `generate` names the package).
- **Test first:** `config only` — the suites that assert ids (the user, chat and attachment
  services, the send-message use case) pass unchanged.
- **Verify:** `make check`; `git grep -n "shared/id"` finds nothing.
- **Model:** `opus medium`
- **Status:** done
- **Findings:**
  - The `domain/**/*.service.ts` override repeats every ban of `domain/**` (Biome replaces, not
    merges, the options of two matching overrides) and lifts only `@app-template/db`'s root; models,
    ports and errors still import no workspace.
  - `packages/db` declares `"sideEffects": false`, as `domain` does: without it Bun walked the
    Postgres client while building the browser bundle and warned about `node:net`; the bundle is
    byte-identical either way.
  - Beyond Files: `docs/knowledge/architecture.md`'s domain rule and its Biome guard row name the
    service exception, which would otherwise read false from this commit.
  - Round S2.2 (review): the domain rule says the exception in its own lead; `sideEffects` added.

#### S3 — The use cases in `application/use-cases`

- **Delivers:** the three use cases and their unit tests and test layers live in
  `application/use-cases` as the package `@app-template/use-cases`, keys
  `'@app-template/use-cases/chat/<Name>UseCase'`. `application/` now holds only workspaces, so a
  module folder can sit beside it. The api, the worker and their e2e import the use cases from the
  new package; nothing else changes.
- **Goal:** every use case above the modules (R6, R8, D2).
- **Blocked by:** S1.
- **Files:** `application/chat/*` → `application/use-cases/chat/`; `application/__tests__/**` →
  `application/use-cases/__tests__/**`; `application/{package.json,tsconfig.json}` →
  `application/use-cases/` (name `@app-template/use-cases`, alias `#use-cases/*`);
  `apps/api/chat/chat.handler.ts`; root
  `package.json` workspaces (`application/*`) and `tsconfig.json`; `biome.json` (override
  `application/**` → `application/use-cases/**`, same bans; `@app-template/application` →
  `@app-template/use-cases` in the `infrastructure/**`, `packages/**` and `deployment/**` lists);
  `apps/api/{layer.ts,package.json,tsconfig.json}`, `apps/api/__tests__/**`; `apps/__e2e__/**`;
  `apps/worker/{chat/*.handler.ts,layer.ts,package.json,tsconfig.json}`, `apps/worker/__tests__/**`;
  `bun.lock`; `CLAUDE.md` (Map), `README.md`, `docs/knowledge/{architecture,database,glossary}.md`;
  `.claude/rules/{layering,naming,deep-modules}.md` where they name `application`'s paths;
  `.claude/rules/effect-services.md` (the key line becomes
  `'@app-template/<package>/<folder>/<Name>'`: the package's name without the scope, then the
  file's folder inside it, if any).
- **Test first:** `config only` — a move: the Seams "the use cases over the memory repositories"
  and "a use case on Postgres" pass, changed only in imports.
- **Verify:** `make check`; `git grep -n '@app-template/application'` finds nothing;
  `ls application` shows only `use-cases`.
- **Model:** `opus medium`
- **Status:** done
- **Findings:**
  - The rules' `paths:` globs (`layering.md`, `deep-modules.md`) stay `application/**`, which still
    matches `application/use-cases/**` and will match the modules; `database.md` and the glossary
    named no moved path and are unchanged.
  - `application/chat/index.ts` and `application/tsconfig.json` show as a delete and an add, not a
    rename: every line of them is an import or a path.
  - Round S3.2 (review): `README.md`'s slice block re-padded; `docs/knowledge/architecture.md`
    names `application/use-cases/` in the workspace table, says `application/` is a folder of
    workspaces with no `package.json` of its own, and re-wraps the edited prose at 100. The layer
    keeps the name `application` in the diagram and the import matrix until S22.

#### S4 — The kernel's config and AWS

- **Delivers:** a new workspace `kernel` (`@app-template/kernel`, alias `#kernel/*`) with
  `/config`, today's `packages/config` with the pinned images; `/aws`, the S3 and SQS clients
  built from `AwsConfig`; and `/aws/resources`, the app's AWS inventory, the `unbound` tag and the
  naming rule as plain constants. `AwsTest` moves to `@app-template/kernel/testing-e2e`.
  `packages/aws` keeps only the generic provisioner: buckets and queues with their dead-letter
  queue, under names the caller passes. Nothing under `packages/` imports this app any more, and
  Biome refuses a kernel import there.
- **Goal:** the kernel holds this app's configuration of its tools; packages know no app (R6, R13,
  R15, D5).
- **Blocked by:** S1.
- **Files:** `packages/config/**` → `kernel/config/**` (keys `'@app-template/kernel/config/<Name>'`),
  its suite → `kernel/__tests__/config/`; `packages/aws/{naming.ts,resources.ts}` split:
  `projectName`, `buildResourceName`, `resources` and `unboundTag` → `kernel/aws/resources/` (with
  `index.ts`), while `buildDeadLetterName` and the `Resources`, `BucketResource` and
  `QueueResource` interfaces stay; `packages/aws/{provision.ts,index.ts}` (a name function in place
  of the stage); `infrastructure/shared/aws.client.ts` → `kernel/aws/aws.client.ts`;
  `infrastructure/__e2e__/testing/aws.test-layer.ts` → `kernel/__e2e__/testing/`;
  `infrastructure/__tests__/shared/resources.test.ts` → `kernel/__tests__/aws/`, but its case on
  `unboundLifetime`, which reads chat's domain, stays in `infrastructure/__tests__/shared/` until
  S19; new
  `kernel/{package.json,tsconfig.json,config/index.ts,aws/index.ts,__tests__/testing/index.ts,__e2e__/testing/index.ts}`;
  `packages/queue/__e2e__/queue.e2e.ts` (a local name function in place of `buildResourceName`; it
  keeps `provisionQueues`, `buildDeadLetterName` and `Resources` from `@app-template/aws`); `packages/testing/tsconfig.json` (drops the unused `config`
  reference); every importer of `@app-template/config` or `@app-template/aws` (29 `.ts` files
  across `infrastructure`, `apps/*`, `deployment` and `packages/queue`) with its `package.json` and
  `tsconfig.json`; `infrastructure/{shared/index.ts,__e2e__/testing/index.ts}`; root `package.json`
  (+ `kernel`) and `tsconfig.json`; `biome.json` (`packages/**` also refuses
  `@app-template/kernel/**`; the `apps/web/main.ts` and `deployment/**` overrides name the
  kernel); `bun.lock`; new `kernel/CLAUDE.md`; `packages/CLAUDE.md` without its exceptions;
  `apps/CLAUDE.md`, `deployment/CLAUDE.md`, `docs/knowledge/{tooling,aws,ai,architecture}.md`,
  `.claude/rules/{tooling,effect-services}.md` (they name `@app-template/config`),
  `.claude/rules/naming.md` (`.client` lives in the kernel too).
- **Test first:** `config only` — a move: the config and resources suites pass at their new paths;
  the queue e2e passes on queue names of its own.
- **Verify:** `make check`; `git grep -n "@app-template/config"` finds nothing, and every import of
  `@app-template/aws` names only `provision`, `provisionQueues`, `Resources` or
  `buildDeadLetterName`; a throwaway import of `@app-template/kernel/config` in `packages/queue`
  fails `make lint` (reverted).
- **Model:** `opus medium`
- **Status:** done
- **Findings:**
  - About 520 changed lines against the ~400 limit, `bun.lock` aside: some 100 are the kernel's
    own Biome overrides, the rest a move that `tsc -b` refuses half done.
  - `kernel/**` and `kernel/__tests__/**` get Biome overrides beyond Files (relative imports, no
    layer or app, no e2e support in a unit test), so the kernel is never the one workspace without
    S1's guards; S21 replaces them with the per-ring overrides.
  - `resources.test.ts` stays whole in `infrastructure/__tests__/shared/`: its one case reads
    chat's domain (`unboundLifetime`), so nothing moves to `kernel/__tests__/aws/` before S19.
    No empty `kernel/__tests__/testing/index.ts` or `./testing` export: S16 creates them.
  - `provision` and `provisionQueues` take a name function in place of the stage; the queue's e2e
    names its queues `queue-<stage>-<name>`, since a package may not import the kernel's rule.
  - Beyond Files: the root `CLAUDE.md` Map, `README.md` and `roadmap.md` name the moved paths;
    `docs/knowledge/architecture.md`'s tables gain a `kernel` row and column.
  - Round S4.2 (review): `kernel/CLAUDE.md` states why the kernel exists instead of listing its
    subpaths, `packages/CLAUDE.md` keeps the split as a pattern without naming packages, the docs
    show `provision`'s name function, and long lines are re-wrapped.

#### S5 — The generic database package

- **Delivers:** a new package `@app-template/db` holds the database tools any app could use:
  `createDb(relations)` (a Drizzle over `PgClient` that logs statements at `Debug`), `Transaction`,
  `decodeOptionalRow`, `unwrapQueryError`, `orDieOnNoRows`, `orDieWithSqlError`, the shared
  columns, `migrateDatabase(folder)` and `retryWhileUnreachable`; `TransactionTest` under
  `./testing` and `flipSqlError` under `./testing-e2e`. `infrastructure`'s `Db` becomes
  `createDb(relations)`; the migrate entry passes its folder.
- **Goal:** the database technology in a configurable package (R6, D5).
- **Blocked by:** S1.
- **Files:** new `packages/db/{package.json,tsconfig.json,index.ts,db.client.ts,migrate.ts,__tests__/testing/index.ts,__e2e__/testing/index.ts}`;
  `infrastructure/db/columns.ts` → `packages/db/columns.ts`; `TransactionTest` →
  `packages/db/__tests__/testing/`, `flipSqlError` → `packages/db/__e2e__/testing/`;
  `infrastructure/db/{db.client.ts,migrate.ts,index.ts}`, `infrastructure/__e2e__/testing/db.test-layer.ts`;
  every importer of the moved helpers in `infrastructure/**` and `application/use-cases/**`, and of
  `Transaction` or `TransactionTest` in `apps/api/{layer.ts,__tests__/testing/api.test-layer.ts}`
  and `apps/worker/layer.ts`, with their `package.json` and `tsconfig.json`;
  `infrastructure/__e2e__/testing/e2e.test-setup.ts` (`migrateDatabase(folder)` over the template's
  `PgClient`); `infrastructure/__e2e__/db/{db.client.e2e.ts,migrate.e2e.ts}`: the logging,
  `Transaction` and `retryWhileUnreachable` cases → `packages/db/__e2e__/`, on a table each test
  creates with plain SQL on its own database; the `applyMigrations` case stays; root
  `tsconfig.json`; `bun.lock`; `docs/knowledge/{database,tooling,architecture}.md`,
  `.claude/rules/effect-tests.md`, `infrastructure/CLAUDE.md`.
- **Test first:** `packages/db/__e2e__/` — `migrateDatabase(folder)` applies the folder it is given
  and answers how many it applied; red until it takes the folder.
- **Verify:** `make check`; `git grep -n "#infrastructure/db/columns"` finds nothing.
- **Model:** `opus medium`
- **Status:** done
- **Findings:**
  - `createDb(relations)` answers the `make` effect, not a `Db` class: a class returned from a
    function fails `tsc -b`'s declarations (TS4023 on Effect's internals), and an explicit
    `Context.ServiceClass` return type breaks Effect's `Unify`. The app declares
    `class Db extends Context.Service<…>()(key, { make: createDb(relations) })`, as Drizzle's own
    `PgDrizzle.make` is used; `architecture.md`'s `Db = createDb(relations)` still reads true, and
    S9 moves that class to `kernel/data`.
  - About 480 changed lines against the ~400 limit, `bun.lock` aside: mostly the client, the
    migrator and their suites moving, which `git` counts as new lines in a new package.
  - `unwrapQueryError` stays in the `@app-template/db` barrel: the outbox relay catches its query
    errors with it. `migrationsFolder` is exported from `infrastructure/db/migrate.ts` for the e2e
    setup; S6 moves both. `flipSqlError` lives in `sql-error.test-util.ts`.
  - Picked after S3 and S4: the kernel's Biome overrides from S4 named `@app-template/application`
    and now name `@app-template/use-cases`.
  - Round S5.2 (review): the `applyMigrations` case keeps its `applied === 0` assertion, the
    `createDb` doc keeps only what a caller needs, `packages/CLAUDE.md` is left to S4's pattern,
    and long lines are re-wrapped.

#### S6 — The kernel's Postgres client and the migrations

- **Delivers:** `kernel/postgres` (`@app-template/kernel/postgres`) holds `PgClientFromConfig` and
  the `make migrate` entry; `kernel/data` holds the migrations and the drizzle-kit config; the e2e
  run's setup (the migrated Postgres template and MiniStack) lives in
  `@app-template/kernel/testing-e2e`. `make migrate`, `make migration` and `make migration-check`
  run from the root with `--config kernel/data/drizzle.config.ts`, whose paths drizzle-kit
  resolves against the working directory: `schema: ['infrastructure/*/*.entity.ts',
  'kernel/data/*/*.table.ts']` (a glob that matches nothing is skipped),
  `out: 'kernel/data/migrations'`. `drizzle-kit` becomes a root devDependency, since the isolated
  linker puts a workspace's binary only in that workspace.
- **Goal:** the app's connection to Postgres at the boundary, the schema's history with the data
  (R4, R5, R6, D5, D18).
- **Blocked by:** S4, S5.
- **Files:** `PgClientFromConfig` → `kernel/postgres/postgres.client.ts`;
  `infrastructure/db/migrate.ts` → `kernel/postgres/migrate.ts`; `infrastructure/db/migrations/**`
  → `kernel/data/migrations/**`; `infrastructure/drizzle.config.ts` →
  `kernel/data/drizzle.config.ts`; `infrastructure/__e2e__/testing/e2e.test-setup.ts` →
  `kernel/__e2e__/testing/`; `infrastructure/__e2e__/db/migrate.e2e.ts` →
  `kernel/__e2e__/postgres/`; new `kernel/{postgres/index.ts,data/index.ts}`;
  `kernel/{package.json,tsconfig.json}`; root `package.json` (`drizzle-kit` from
  `infrastructure`'s devDependencies); `infrastructure/db/{db.client.ts,index.ts}`
  (`Db.layerFromConfig` provides the kernel's client); `vitest.config.ts` (`globalSetup`);
  `Makefile` (`migrate`, `migration`, `migration-check` and their comments); `biome.json`
  (`files.includes` ignores `kernel/data/migrations`); `infrastructure/{package.json,tsconfig.json}`;
  `bun.lock`; `docs/knowledge/{database,tooling,architecture,aws}.md`, `kernel/CLAUDE.md`,
  `infrastructure/CLAUDE.md`.
- **Test first:** `config only` — a move: `applyMigrations` applies nothing to the template copy,
  at `kernel/__e2e__/postgres/`.
- **Verify:** `make check`; `make up` then `make migrate` prints `nothing to apply`;
  `make migration-check` from the root reports no change.
- **Model:** `opus medium`
- **Status:** done
- **Findings:**
  - `PgClientFromConfig` fails with `Config.ConfigError | SqlError.SqlError`: `PgClient.layer`
    fails with `SqlError` when it cannot connect, and the contract's narrower type did not compile;
    `architecture.md › Contracts` now says so.
  - `migrationsFolder` lives in a new `kernel/data/migrations.ts`, re-exported by
    `kernel/data/index.ts`, so every `index.ts` stays a barrel; S10 deletes only the folder.
  - The e2e setup sits in `kernel/__e2e__/testing/` but is not exported from `./testing-e2e`:
    vitest loads it by path, and an export would pull testcontainers into every importer.
  - `kernel/postgres/index.ts` re-exports only `PgClientFromConfig`, so infrastructure's `Db` does
    not load the migrate entry and `BunRuntime`.
  - `@effect/sql-pg`, `drizzle-kit` and testcontainers leave `infrastructure`'s manifest.
  - Round S6.2 (review): the barrel trimmed, `kernel/CLAUDE.md` says why the migrations live in the
    kernel, `DRIZZLE_CONFIG` joins the Makefile's variables, `database.md` re-wrapped.

#### S7 — The language model in a package and the kernel

- **Delivers:** `packages/llm` builds a language model of a provider from plain options: Anthropic
  (API key, model, settings, the 10-minute idle limit) and the stub.
  `@app-template/kernel/llm` has `createLanguageModel(purpose)`, which picks the provider by
  `LlmConfig`. Chat's `AssistantModels` builds the reply and the title models through it and moves
  into `assistant.llm.ts`; `assistant.client.ts` goes, and chat's adapters no longer depend on
  `@effect/ai-anthropic`.
- **Goal:** one place to add a provider for every module (R2, R6, D6).
- **Blocked by:** S4.
- **Files:** `packages/llm/{client.ts,package.json,tsconfig.json}`; new
  `kernel/llm/{index.ts,llm.client.ts}`; `kernel/package.json` (`@effect/ai-anthropic`);
  `infrastructure/chat/{assistant.client.ts (deleted),assistant.llm.ts,index.ts}`;
  `infrastructure/__tests__/chat/assistant.llm.test.ts`; `infrastructure/{package.json,tsconfig.json}`;
  `bun.lock`; `docs/knowledge/{ai,architecture}.md`, `README.md`.
- **Test first:** the `AssistantLlm` adapter over a recording `HttpClient` — the suite builds
  `AssistantModels` from `LlmConfig` set by `ConfigProvider.fromUnknown` (`LLM_PROVIDER`
  `anthropic` with `ANTHROPIC_API_KEY`, `LLM_REPLY_MODEL`, `LLM_TITLE_MODEL`, and `stub`) in place
  of the removed `layerAnthropic` and `layerStub`; every case keeps its assertions, the request
  settings included; red until `AssistantModels` is built through `createLanguageModel` (D6, D14).
- **Verify:** `make check`; `git grep -n "ai-anthropic" infrastructure ':!infrastructure/__tests__' ':!infrastructure/package.json'` finds
  nothing (the suite keeps its type import and devDependency);
  `LLM_PROVIDER=stub make dev`: a reply and a title arrive.
- **Model:** `opus high`
- **Status:** done
- **Findings:**
  - `kernel/package.json` gains `@app-template/llm`, not `@effect/ai-anthropic`: `packages/llm`
    exports the request type, so the provider's library stays in one package (D6).
  - `AssistantModels` is gone rather than moved: `AssistantLlm` builds the reply and the title
    models itself through `createLanguageModel`, since a service with one layer and one consumer
    failed the deletion test (Depth and Standards); `infrastructure`'s index re-exports the layer as
    `AssistantLlmFromConfig`, so the worker is untouched.
  - `packages/llm`'s request type is `AnthropicRequestConfig`, apart from `@effect/ai-anthropic`'s
    `AnthropicConfig` module; the contract follows.
  - The purpose stays keyed by provider, as the contract fixes it; D6's note hands a
    provider-neutral purpose to `openai-provider` (19).
  - One `AnthropicClient` per model and `LlmConfig` read once per model, where one layer served
    both: stateless, read at start, no request changes.
  - The Verify grep skips `infrastructure/package.json`, whose devDependency the suite keeps.
  - Round S7.2 (review): `AssistantModels` dissolved, the type renamed, `ai.md` re-wrapped.

#### S8 — The tables in the data layer

- **Delivers:** every table, enum, index and relation lives in `kernel/data`, in a folder per store
  (`chat/`, `attachment/`, `user/`, `outbox/`), exported from `@app-template/kernel/data` and its
  subpaths. Each store splits today's entity file in two: `<name>.table.ts` holds the table and
  imports only tables, `<name>.entity.ts` exposes `<Name>Entity`, `<Name>EntityInsert`,
  `<Name>EntityWhere` and `<Name>EntitySet`; `ChatEntity` and `MessageEntity` nest their
  attachments, as every read returns them. Both import only packages: they declare the enums'
  values, the checks' limits and patterns and the message failure's shape themselves. The
  decoding into models moves to `<model>.mapper.ts` beside today's repositories (`ChatFromEntity`
  in place of `ChatFromRow`, the models' schemas laid over the entity's fields).
  `Db` stays in `infrastructure` one more step, built over the kernel's relations. The schema is
  unchanged: no migration (verified in a scratch run: rc.5 emits nothing when the values match).
- **Goal:** the data at the centre, in its own words (R4, R5, R9, R14, D7, D8, D11).
- **Blocked by:** S6.
- **Files:** `infrastructure/{chat/chat.entity.ts,chat/message.entity.ts,attachment/attachment.entity.ts,user/user.entity.ts,outbox/outbox.entity.ts}`
  → `kernel/data/{chat/chat,chat/message,attachment/attachment,user/user,outbox/outbox}.{table,entity}.ts`;
  `infrastructure/db/relations.ts` (over the `*.table.ts`) →
  `kernel/data/relations.ts`; new `kernel/data/{chat,attachment,user,outbox}/index.ts`; new
  `infrastructure/{chat/chat.mapper.ts,attachment/attachment.mapper.ts,user/user.mapper.ts}`
  (`chat.mapper.ts` holds `ChatFromEntity` and `MessageFromEntity`);
  `infrastructure/{chat/chat.repository.ts,chat/message.repository.ts,attachment/attachment.repository.ts,user/user.repository.ts,outbox/outbox.relay.ts,shared/queue.client.ts,db/db.client.ts}`
  (tables from the kernel, models through the mappers); `infrastructure/__e2e__/testing/rows.test-util.ts`;
  the `infrastructure/__e2e__/**` suites that import a table or a `*FromRow`;
  `kernel/data/drizzle.config.ts` (only `kernel/data/*/*.table.ts`); `kernel/{package.json,tsconfig.json}`
  (`drizzle-orm`); `infrastructure/{package.json,tsconfig.json}`; `bun.lock`;
  `docs/knowledge/{database,architecture}.md` (the entity files' paths, `*FromRow`), `README.md`,
  `.claude/rules/naming.md` (the `.entity` row lives in `kernel/data`; a new `.table` row: a table, importing only tables; a new `.mapper` row: an
  entity's codec into a model, in a module's `services`; `infrastructure` holds them until S17), `.claude/rules/deep-modules.md`
  (`paths:` gains `kernel/**`), `infrastructure/CLAUDE.md`, `kernel/CLAUDE.md`.
- **Test first:** a repository on Postgres — the repository suites pass over the kernel's tables,
  red until the tables move; `make migration-check` reports no change.
- **Verify:** `make check`; `git grep -n "@app-template/domain" kernel` finds nothing.
- **Model:** `opus high`
- **Status:** done
- **Findings:**
  - About 600 changed lines against the ~400 limit, `bun.lock` aside, kept one commit: splitting
    the tables from the entities would have left codecs over the kernel's tables that the next
    step rewrote, and the docs change with the names `make doc-names` checks.
  - `chat_status` keeps three values, as chat's `ChatStatus` does; the contract's six would have
    changed the enum and needed a migration. The contract follows.
  - A nested model is laid by its encoded side in a mapper (`AttachmentFromEntity.from`,
    `Schema.toEncoded(MessageFailure)`): the contract's `AttachmentFromEntity` decoded but failed to
    encode a message, which the message repository's suite caught. The contract follows.
  - No `Where` or `Set` can be empty (Depth review): each `Where` keeps a key required
    (`RequireAtLeastOne` over `id`, `userId` or `chatId`), each `Set` is `RequireAtLeastOne`,
    as the domain's ports are, so S14 and S15 cannot write every row; `type-fest` joins the kernel.
  - Repositories write a model encoded through its mapper, then decoded through
    `<Name>EntityInsert`, which cuts the nested attachments and checks the row.
  - The jsonb column `error` keeps a `$type` from `MessageFailureJson`, declared beside the table;
    the entity takes the same schema. No `UserEntitySet` (users have no update); the outbox keeps
    only its table, since S10 replaces the store with `jobs`.
  - `inCreationOrder` and `withAttachments` stay in `message.entity.ts` until S14's repositories
    take them.
  - Round S8.2 (simplify and review): the regexes lose their dead `i` flag and comments, the
    `Where`/`Set` keys, writes through the insert schema, `naming.md`'s `.table` and `.mapper` rows.

#### S9 — The data layer's `Db` over the client in the context

- **Delivers:** `Db` (`createDb(relations)`, key `'@app-template/kernel/data/Db'`) lives in
  `kernel/data`; its `layer` needs the `PgClient` in the context and reads no config, and the
  apps provide `PgClientFromConfig` beside it. `DbTest` lives in
  `@app-template/kernel/testing-e2e`. The entity suites move to `kernel/__e2e__/data/<store>/` and
  speak entities only. The cases that write a model's extreme value (a title of `maxTitleLength`,
  a media type and a hash the patterns allow) become `apps/__e2e__/mappers/<model>.mapper.e2e.ts`, so a limit
  duplicated between a model and its check cannot drift unseen (D11).
- **Goal:** the data layer whole and testable on its own, its client from outside (R9, D7, D11,
  D18).
- **Blocked by:** S8.
- **Files:** `infrastructure/db/{db.client.ts,index.ts}` → `kernel/data/{db.client.ts,index.ts}`
  (`Db.layerFromConfig` goes); `infrastructure/__e2e__/testing/db.test-layer.ts` →
  `kernel/__e2e__/testing/`;
  `infrastructure/__e2e__/{chat/chat.entity.e2e.ts,chat/message.entity.e2e.ts,attachment/attachment.entity.e2e.ts}`
  → `kernel/__e2e__/data/{chat,chat,attachment}/` (entities, no model); new
  `apps/__e2e__/mappers/{chat,attachment,user}.mapper.e2e.ts` (the extreme-value cases, over
  today's mappers); every importer
  of `DbTest` or `Db` (14: `apps/{api,worker}/layer.ts`, providing `PgClientFromConfig`, the four
  `infrastructure/*/*.repository.ts`, `outbox.relay.ts`, `queue.client.ts`, `rows.test-util.ts`,
  `repository-stack.test-layer.ts`, `apps/__e2e__/testing/db.test-layer.ts`, and the relay's,
  the queue client's and the user repository's e2e);
  `infrastructure/{package.json,tsconfig.json,__e2e__/testing/index.ts}` (no `./db`);
  `docs/knowledge/{database,aws}.md`, `.claude/rules/{effect-tests,effect-services}.md`
  (`DbTest`, `Db.layerFromConfig` as the `provideMerge` exception), the comment in
  `apps/__e2e__/testing/stand.test-layer.ts`.
- **Test first:** a repository on Postgres, in entities, and a mapper on Postgres — the moved
  entity suites and the mapper cases pass; a probe that changes the data layer's title limit turns
  the mapper case red (reverted).
- **Verify:** `make check`; `git grep -n "@app-template/infrastructure/db"` finds nothing;
  `git grep -nE "(@app-template|#)kernel/(config|postgres|aws)" kernel/data` finds nothing.
- **Model:** `opus medium`
- **Status:** done
- **Findings:**
  - The Test first's probe on the data layer's title limit catches nothing: the e2e database is
    built from the migrations, so a change to a `*.table.ts` alone is `make migration-check`'s to
    catch. A migration that narrows `chats_title_check`, `attachments_media_type_check` or
    `credentials_hash_check` turns all three mapper suites red (probed, then reverted).
  - The chat and attachment mappers join `infrastructure`'s barrels so `apps/__e2e__` reaches them,
    until S17 moves them into the modules.
  - The hash case goes through `UserRepositoryPg`, since `credentials` has no mapper, and is named
    for its check; S12, which removes `UserRepositoryPg`, rewrites it over the data layer's
    `UserRepository` rather than changing an import.
  - `infrastructure` loses its `./testing-e2e` export, whose only member was `DbTest`.
  - The chat entity suite's too-long case writes `'a'.repeat(121)`: the data layer reads no model.
  - Round S9.2 (review): the hash suite's name and comment, `database.md` re-wrapped.

#### S10 — Jobs as data, a fresh schema, the queue at the boundary

- **Delivers:** the table `outbox` is `jobs` (`kernel/data/job/job.{table,entity}.ts`: `JobEntity`,
  `JobEntityInsert`, `JobEntityWhere`, `JobEntitySet`), and the two migrations give way to one
  initial migration generated from the data layer, since the app is not in production.
  `JobRepository` (`@app-template/kernel/data/job`) inserts a job, selects the unsent rows
  `for update skip locked` and sets `sentAt`. `QueueSenderJobs` and `QueueConsumerSqs`
  (`kernel/queue/queue.client.ts`) and `JobRelaySqs` (`kernel/queue/job.relay.ts`) live in
  `@app-template/kernel/queue`, the sender and the relay over `JobRepository`, composed by layers.
  `infrastructure/shared` and `infrastructure/outbox` are gone. Jobs, queues, attempts and the dead
  letter are unchanged; every database is recreated once with `make reset`.
- **Goal:** jobs are data like any table, the schema one migration, the queue's transport the
  boundary (R2, R4, R5, R9, R10, D9, D20).
- **Blocked by:** S9.
- **Files:** `kernel/data/outbox/outbox.{table,entity}.ts` → `kernel/data/job/job.{table,entity}.ts` (table
  `jobs`), `kernel/data/{relations.ts,index.ts}`; `kernel/data/migrations/**` deleted and one
  initial migration generated (`make migration NAME=init`); new
  `kernel/data/job/job.repository.ts` (the queries of today's sender and relay) and its suite
  `kernel/__e2e__/data/job/job.repository.e2e.ts`; `kernel/data/job/index.ts`;
  `infrastructure/shared/queue.client.ts` → `kernel/queue/queue.client.ts`;
  `infrastructure/outbox/outbox.relay.ts` → `kernel/queue/job.relay.ts`; new
  `kernel/queue/index.ts`; `infrastructure/{shared/index.ts,outbox/index.ts}` gone;
  `infrastructure/__e2e__/outbox/outbox.relay.e2e.ts` and
  `infrastructure/__e2e__/shared/queue.client.e2e.ts` → `kernel/__e2e__/queue/`; the raw SQL that
  names `outbox` in `apps/__e2e__/**`; `infrastructure/package.json` (no `./shared`,
  `./outbox`); `apps/api/layer.ts`, `apps/worker/layer.ts`;
  `application/use-cases/__tests__/testing/chat.test-layer.ts`;
  `apps/__e2e__/testing/stand.test-layer.ts`; `kernel/package.json`
  (`@effect-aws/client-sqs`); `bun.lock`; `docs/knowledge/{database,architecture,aws,glossary}.md`
  (the table `jobs`, the reset; "Outbox" names the pattern), `.claude/rules/layering.md` (the
  enqueue line's link), `.claude/rules/naming.md` (the `.relay` row lives in the kernel), `infrastructure/CLAUDE.md`, `kernel/CLAUDE.md`.
- **Test first:** a repository on Postgres — the jobs suite (a lock skips a row another
  transaction holds, `sentAt` set once) is red until `JobRepository` exists; the relay's and the
  queue client's e2e pass unchanged at `kernel/__e2e__/queue/`; the send-message e2e still rolls
  back the job with the write.
- **Verify:** `make check`; `make reset` then `make up` applies one migration; a
  `pg_dump --schema-only` diffed against one of `main`'s shows only `outbox` renamed `jobs`
  (output pasted in the step report); `make migration-check` reports no change; `make dev`, send a
  message in the web app: the reply and the title arrive.
- **Model:** `opus high`
- **Status:** done
- **Findings:**
  - `JobRepository.update` takes `JobEntityUpdateWhere`, which requires both `id` and
    `sentAt: null`, so a write never matches every job and a sent job's `sentAt` is set once (a
    note on D9); a new case checks that a second update of a sent job dies and keeps its `sentAt`.
    `naming.md`'s `.entity` row names a `<Verb>Where` for the one verb whose filter differs.
  - `QueueConsumerSqs` takes `SQSService` from the context, as `JobRelaySqs` does; the worker
    provides `SQSServiceFromConfig` once, in a later `Layer.provide` than both, since siblings in
    one `Layer.provide([…])` do not feed each other. The Contract now names its type.
  - The kernel's queue suites send a `SampleJob` fixture of their own
    (`kernel/__e2e__/testing/job.test-fixture.ts`), since the kernel imports no module's queue
    definitions.
  - The relay reads and writes only through `JobRepository`, whose methods die on an SQL error;
    its `catchCauseIf` logs and swallows every non-interrupt cause, which a new case checks (a
    renamed table: one log line, nothing sent, the row sent on the next poll).
  - The `pg_dump --schema-only` diff against `main` shows only `outbox` renamed `jobs`, with its
    primary key and partial index. A database migrated before the single `init` needs one
    `make reset`, which `database.md` says.
  - A job that SQS refuses forever blocks its batch and re-sends the jobs before it on every
    poll, as before this step; `jobs` (22) in the roadmap now owns the relay's attempts and dead
    letter.
  - Size: 40 files, +576 / −412, over the ~400 lines; the replaced migrations and their
    snapshots are about 190 of them, the rest mostly moves.

#### S11 — The identity module and its contract

- **Delivers:** `application/identity` (`@app-template/identity`) holds the user, the credential
  and, for one more step, the `UserRepository` port in `domain/`, `UserService` in `services/`, and
  its unit tests and their support in `__tests__/`. `application/identity/contract`
  (`@app-template/identity-contract`, keys `'@app-template/identity-contract/<Name>'`) holds
  `UserId`, `UserUnknownError`, `CurrentUser` and `Auth`; chat, `http-api` and the apps import
  them from there. `UserRepositoryPg` stays in `infrastructure/user` one more step, over the new
  port. `matches`, `matchesAny`, `updateRow`, the memory `orDieOnNoRows` and `epoch` move to
  `@app-template/testing`, so the kernel's memory repositories will need no module; chat's fixtures keep `owner` and
  `stranger` as plain `UserId`s. The OpenAPI document is unchanged.
- **Goal:** the first module, reachable only through its contract (R1, R6, R7, R8, R16, D1, D3,
  D4).
- **Blocked by:** S2, S3, S9.
- **Files:** `domain/user/{user.model.ts,user.port.ts}` → `application/identity/domain/`;
  `domain/user/user.service.ts` → `application/identity/services/`;
  `domain/user/{user.id.ts,user.error.ts}` → `application/identity/contract/`; `CurrentUser`,
  `Auth` from `http-api/shared/security.ts` → `application/identity/contract/auth.ts`;
  `domain/__tests__/testing/user.test-{fake,fixture}.ts` → `application/identity/__tests__/testing/`;
  `domain/__tests__/user/*` → `application/identity/__tests__/{domain,services}/`; new
  `application/identity/{package.json,tsconfig.json}` (`"exclude": ["contract"]`, a reference to
  `./contract`) and `application/identity/contract/{package.json,tsconfig.json,index.ts}`;
  `infrastructure/user/{user.repository.ts,user.mapper.ts,index.ts}` (the port from identity);
  `domain/__tests__/testing/{rows.test-util.ts,repository-stack.test-layer.ts,chat.test-fixture.ts,index.ts}`,
  `packages/testing/{index.ts,rows.test-util.ts}`; every importer of `@app-template/domain/user`
  (21 files by the package name, 17 inside `domain` by `#domain/user`)
  with about 10 `package.json` and `tsconfig.json`; `http-api/{index.ts,package.json,tsconfig.json}`;
  `apps/api/{layer.ts,shared/security.ts,user/user.handler.ts,__tests__/testing/api.test-layer.ts}`;
  `http-api/{chat/chat.http.ts,attachment/attachment.http.ts}` (`Auth`),
  `apps/api/{chat/chat.handler.ts,attachment/attachment.handler.ts}` (`CurrentUser`); every
  importer of `epoch` (the use cases' suites and e2e, `application/use-cases/__tests__/testing`,
  the worker handler's suite, the assistant's suite, the chat and attachment services' suites);
  root `package.json` (`application/*/contract`) and `tsconfig.json`; `biome.json` (overrides for
  `application/*/domain/**`, `application/*/__tests__/**`, `application/*/contract/**` copying
  today's domain ones, the `__tests__` one also allowing `@app-template/*-contract` and
  `@app-template/kernel/testing`; `http-api/**` allows `*-contract`); `Makefile` (`bundle-check` greps the new
  key forms beside the old); `bun.lock`; `docs/knowledge/{architecture,database,tooling}.md`,
  `.claude/rules/naming.md`, `http-api/CLAUDE.md`, `domain/CLAUDE.md`.
- **Test first:** `config only` — a move: the Seam "`Api` through `ApiHttp`" and the identity
  suites pass at their new paths; the OpenAPI document of `Api` is identical before and after (a
  throwaway dump of `OpenApi.fromApi(Api)` diffed, not committed).
- **Verify:** `make check`; `git grep -n "@app-template/domain/user"` finds nothing;
  `make bundle-check` fails on a throwaway import of `UserService` into the web app (reverted).
- **Model:** `opus medium`
- **Status:** done
- **Findings:**
  - `http-api` imports identity's `domain` beside the contract: its user DTO is the `User` model
    (a note on D3).
  - Chat's `RepositoryStackTest` drops the user's memory layers, and the api test layer adds them
    from `@app-template/identity/testing`: kept in domain's stack, `tsc -b` fails with TS2883,
    since its declarations cannot name `UserRepository` outside domain's program.
  - `user.test-fixture.ts` held only `epoch`, so it went to `packages/testing/clock.test-fixture.ts`
    and identity has no fixture file.
  - A Biome override for `application/*/services/**` lands now, copying the domain service one, so
    identity's services are never unguarded; S13 had planned it. The module's overrides sit before
    the use cases' ones, since Biome keeps the last matching override's options.
  - `make bundle-check` also greps the module key forms (`<module>/services/`,
    `<module>/infrastructure/`, a port key in `<module>/domain/`).
  - Size: 86 files, +481 / −160, most of it moves and import lines; `biome.json` alone is +210.

#### S12 — The user's repository in the data layer

- **Delivers:** `UserRepository` is the data layer's (`@app-template/kernel/data/user`), over
  `UserEntityWhere`; the identity port and `UserRepositoryPg` are gone, `UserService` calls the
  repository and maps with `UserFromEntity` in `services/`, and the memory `UserRepositoryTest`
  lives in `@app-template/kernel/testing` over entities. Identity's arrange helpers take models and
  encode them through the mapper, so its suites' cases do not change. The rules now describe a
  repository without a port.
- **Goal:** the first service over the data layer, no port in between (R9, D4, D7, D14).
- **Blocked by:** S11.
- **Files:** `application/identity/domain/user.port.ts` (deleted);
  `infrastructure/user/user.repository.ts` → `kernel/data/user/user.repository.ts`;
  `infrastructure/user/user.mapper.ts` → `application/identity/services/`;
  `infrastructure/user/index.ts` gone; `application/identity/__tests__/testing/user.test-fake.ts`
  → `kernel/__tests__/testing/user.test-fake.ts`;
  `application/identity/{services/user.service.ts,__tests__/**}`;
  `infrastructure/__e2e__/user/user.repository.e2e.ts` → `kernel/__e2e__/data/user/` (in
  entities); `apps/__e2e__/mappers/user.mapper.e2e.ts` (imports identity's mapper);
  `apps/api/{layer.ts,__tests__/testing/api.test-layer.ts}`; `.claude/rules/layering.md`,
  `.claude/rules/effect-tests.md` (a unit test runs the services over the data layer's memory
  repositories; the e2e twin is the data layer's repository), `.claude/rules/effect-services.md`
  (no `<Model>RepositoryPg`), `.claude/rules/deep-modules.md` (a deep repository, the memory fake
  as the repository's second layer), `.claude/rules/naming.md` (the `.repository` row: the data
  layer's access to a store, in `kernel/data`; the `.service` row in a module's `services`; the
  `.port` row without repositories); `docs/knowledge/database.md`.
- **Test first:** a module's services over the memory repositories — the user service's suite
  runs over `UserRepositoryTest` with every case kept; red until the data layer's repository
  exists.
- **Verify:** `make check`; `git grep -n "UserRepositoryPg"` finds nothing.
- **Model:** `opus high`
- **Status:** done
- **Findings:**
  - Identity's mapper owns the codec pair beside `UserFromEntity`: `encodeUser`, `decodeUser`
    and `encodeCredential`, each dying on a mapping failure. The service and the mapper e2e call
    them, and chat's mappers take this shape in S17; no generic helper in `packages/db` yet.
  - `UserEntityCredential` names `{ kind, hash }` of `credentials`: the key `insert` writes and
    `selectOne` filters by.
  - `insert` takes `UserEntityInsert`, whose id the column defaults, so it reads the id back with
    `RETURNING`. The memory fake requires the id every caller passes, and dies, writing nothing,
    when a stored row holds the id or the credential (matched on `kind` and `hash`).
  - No arrange helpers in identity: the service suite writes no rows, and its one read step
    decodes the stored credential (D14).
  - `biome.json`, off the Files: `application/*/services/**` may import
    `@app-template/kernel/data/*`, as D4 has a service depend on the data layer; identity loses
    its `./testing` export.
  - The Verify grep finds `UserRepositoryPg` only in `docs/tickets/`, the earlier tickets' text.
  - `infrastructure/__e2e__/testing/{repository-stack.test-layer.ts,rows.test-util.ts}` have no
    importer since S9; S17 deletes them with the adapters.
  - Round S12.2 (review): the codec pair in the mapper, the fake's primary keys, doc lines
    re-wrapped.
  - Size: 34 files, +302 / −258.

#### S13 — Chat's domain and services in its module

- **Delivers:** `application/chat` (`@app-template/chat`) holds chat's domain (chats, messages,
  the assistant, attachments, `Status`, still with the repository and bucket ports) in `domain/`,
  its domain services in `services/`, and its unit tests with their memory layers and fixtures in
  `__tests__/`. The `domain` workspace is gone; consumers import `@app-template/chat/domain`,
  `@app-template/chat/services` and `@app-template/chat/testing`. `application/CLAUDE.md` starts
  from `domain/CLAUDE.md`.
- **Goal:** chat's rules in its module (R6, R8, R16, D1, D4, D13).
- **Blocked by:** S11.
- **Files:** `domain/chat/*` and `domain/attachment/*` but their `*.service.ts`, and
  `domain/shared/status.model.ts` → `application/chat/domain/`; `domain/chat/chat.service.ts`,
  `domain/attachment/attachment.service.ts` → `application/chat/services/`;
  `domain/__tests__/testing/*` → `application/chat/__tests__/testing/`;
  `domain/__tests__/{chat,attachment}/*` → `application/chat/__tests__/{domain,services}/`;
  `domain/{package.json,tsconfig.json,CLAUDE.md,shared/index.ts}` gone; new
  `application/chat/{package.json,tsconfig.json}` and one barrel per layer,
  `application/chat/{domain,services}/index.ts`, in place of `domain/{chat,attachment}/index.ts`; new `application/CLAUDE.md`; service keys
  `'@app-template/chat/{domain,services}/<Name>'`; every importer of `@app-template/domain/*` in
  `infrastructure`, `application/use-cases`, `http-api`, `apps/*` with its `package.json` and
  `tsconfig.json`; root `package.json` and `tsconfig.json`; `biome.json` (the `domain/**` overrides
  gone; `application/*/services/**` copying today's application one; `http-api/**` allows
  `@app-template/*/domain` in place of `@app-template/domain`); `Makefile` (`bundle-check`);
  `bun.lock`; `CLAUDE.md` (Map), `docs/knowledge/{architecture,tooling,aws}.md`,
  `.claude/rules/{effect-tests,naming,layering,deep-modules}.md` (paths and `paths:` globs naming
  `domain/`), `http-api/CLAUDE.md`, `README.md`.
- **Test first:** `config only` — a move: the Seam "a module's services over the memory
  repositories" passes at `application/chat/__tests__/`.
- **Verify:** `make check`; `git grep -n "@app-template/domain"` finds nothing; `ls domain` fails;
  `make bundle-check` fails on a throwaway import of `ChatService` into the web app (reverted).
- **Model:** `opus medium`
- **Status:** done
- **Findings:**
  - The `application/*/services/**` override had landed in S11, so this step adds none.
  - The kernel, packages and deployment overrides ban `@app-template/chat` where they banned
    `@app-template/domain`, so the guard does not lapse; identity is unguarded there since S11,
    which S21's per-ring guards close.
  - The Dependency rules table in `docs/knowledge/architecture.md` names `use-cases` where it named
    `application`, and its module column states what `biome.json` allows (`http-api`: `domain`
    only; `infrastructure`: all but `services`); S22 rewrites the page.
  - `make bundle-check`'s throwaway import of `ChatService` goes through `http-api/index.ts`, since
    the web app may not import a module.
  - Beyond the Files: `.claude/skills/explain/REPORT.md` (the layers of its diagram, S23's file) and
    one path in `docs/knowledge/roadmap.md` (`application/chat/domain/status.model.ts`).
  - Round S13.2 (review): doc lines re-wrapped to 100, `effect-tests.md` names
    `@app-template/<module>/testing`, the table checked cell by cell against `biome.json`.
  - Size: 110 files, +391 / −554, nearly all moves and import lines; the four `domain/**`
    overrides account for −179.

#### S14 — Chats and messages in the data layer

- **Delivers:** `ChatRepository` and `MessageRepository` are the data layer's
  (`@app-template/kernel/data/chat`), over `ChatEntityWhere`, `ChatEntitySet` and their message
  twins, with their e2e suites at `kernel/__e2e__/data/chat/` in entities. Until S17 the ports'
  adapters `ChatRepositoryPg` and `MessageRepositoryPg` delegate to them through the mappers, so
  the services do not change yet.
- **Goal:** chat's data access in the data layer (R9, D7, D8).
- **Blocked by:** S9.
- **Files:** new `kernel/data/chat/{chat.repository.ts,message.repository.ts}` (the query code of
  `infrastructure/chat/{chat.repository.ts,message.repository.ts}`); those two files become
  delegating adapters; `infrastructure/__e2e__/chat/{chat.repository.e2e.ts,message.repository.e2e.ts}`
  → `kernel/__e2e__/data/chat/` (in entities); `kernel/data/chat/index.ts`;
  `docs/knowledge/database.md`.
- **Test first:** a repository on Postgres, in entities — the moved suites pass over the data
  layer's repositories, red until they exist.
- **Verify:** `make check`.
- **Model:** `opus high`
- **Status:** done
- **Findings:**
  - One where builder serves every message verb, the owner as
    `chat_id IN (select id from chats where user_id = …)`, so `update` honours `userId` too; the
    relational filter covered only the reads. A new case checks the owner in an update's where.
  - The message adapter passes the whole row as the set, so an update writes status, text, error
    and `updatedAt` only; the port's doc says so.
  - The chat adapter maps its set with `Struct.mapPick` over typed lambdas (`GetOrNull`,
    `ToDateUtc`), as S15 does, in place of a cast to `ChatEntitySet`.
  - `inCreationOrder` and `withAttachments` stay in `message.entity.ts`, out of the barrel, so the
    chat repository does not import the message repository. `ChatEntity` and `MessageEntity` name
    the entity types beside their schemas.
  - An update's or a delete's die message names no id (`no chat was updated`), where the adapters'
    named `where.id`: a where may find its rows by `userId` alone. An insert's still names the id.
  - Beyond the Files: `domain/chat/message.port.ts` (the doc of `update`),
    `kernel/__e2e__/data/chat/message.entity.e2e.ts`, `docs/knowledge/architecture.md`.
  - Size: 14 files, +788 / −588, over the ~400 lines: two repositories and their two suites move
    whole, and the adapters are rewritten over them.

#### S15 — Attachments in the data layer

- **Delivers:** `AttachmentRepository` is the data layer's (`@app-template/kernel/data/attachment`),
  over `AttachmentEntityWhere` and `AttachmentEntitySet`, with its e2e suite at
  `kernel/__e2e__/data/attachment/` in entities; until S17 `AttachmentRepositoryPg` delegates to it.
- **Goal:** the last table repository in the data layer (R9, D7, D8).
- **Blocked by:** S9.
- **Files:** new `kernel/data/attachment/attachment.repository.ts`;
  `infrastructure/attachment/attachment.repository.ts` (delegating);
  `infrastructure/__e2e__/attachment/attachment.repository.e2e.ts` →
  `kernel/__e2e__/data/attachment/`; `kernel/data/attachment/index.ts`; `docs/knowledge/database.md`.
- **Test first:** a repository on Postgres, in entities — the moved suite passes, red until the
  repository exists.
- **Verify:** `make check`.
- **Model:** `opus high`
- **Status:** done
- **Findings:**
  - The set crosses the adapter through `Struct.mapPick` with a typed lambda (`getOrNull`), not
    `Struct.evolve`: evolve maps a key by one function over the whole `RequireAtLeastOne` union,
    so the key a branch requires comes out `| undefined`. The where keeps `Struct.evolve`.
  - `AttachmentRepository.update` writes its set through `buildSet`, though `AttachmentEntitySet`
    matches the columns: it drops a key outside the set, which a bare `.set(set)` would write.
    `/simplify` had removed it; round 2 restored it.
  - `AttachmentEntity` names the entity's type beside its schema, in place of an `AttachmentRow`
    alias; S14 names `ChatEntity` and `MessageEntity` the same way.
  - `AttachmentRepositoryPg` provides the data layer's repository itself, so no process or test
    stack changes until S17 composes the data layer.
  - Beyond the Files: `.claude/rules/naming.md` (the `.repository` row) and `kernel/CLAUDE.md`
    name the data layer's repositories.
  - Size: 8 files, +267 / −179.

#### S16 — The memory repositories over entities

- **Delivers:** `ChatRepositoryTest`, `MessageRepositoryTest`, `AttachmentRepositoryTest` and
  `RepositoryStackTest` live in `@app-template/kernel/testing`, over entities, with the guards the
  database adds (the active reply, the cascades). Chat's arrange and read helpers
  (`insertChatLayer`, `selectChat` and the rest) stay in `application/chat/__tests__/testing`,
  take models and go through the mappers, in `chat.test-layer.ts`; chat's
  `repository-stack.test-layer.ts` is gone. No service uses the kernel's memory repositories until
  the next step.
- **Goal:** unit tests over the data layer, their cases unchanged (D4, D14, D19).
- **Blocked by:** S13, S14, S15.
- **Files:** new `kernel/__tests__/testing/{chat.test-fake.ts,attachment.test-fake.ts,repository-stack.test-layer.ts}`
  (the repository halves of `application/chat/__tests__/testing/{chat.test-fake.ts,attachment.test-fake.ts,repository-stack.test-layer.ts}`;
  `AttachmentBucketTest` stays in chat; their matchers from `@app-template/testing`);
  `kernel/__tests__/testing/index.ts`;
  `application/chat/__tests__/testing/{repository-stack.test-layer.ts (deleted),chat.test-layer.ts,index.ts}`.
- **Test first:** `config only` — test support; it is exercised from the next step.
- **Verify:** `make check`.
- **Model:** `opus high`
- **Status:** done
- **Findings:**
  - Chat's arrange and read helpers move into `chat.test-layer.ts` but still call the ports: the
    chat and attachment mappers live in `infrastructure`, which imports `@app-template/chat`.
    They go through the mappers in S17. Until then `@app-template/chat/testing` and
    `@app-template/kernel/testing` both export `ChatRepositoryTest`, `ChatRows` and
    `RepositoryStackTest`, differently typed.
  - The kernel's `RepositoryStackTest` provides `UserRepositoryTest` too: the whole data layer's
    stack, as the Structure has it.
  - Each fake copies the guards its repository's e2e proves: the primary key, the where and set
    fields, the active reply on insert and update, the cascade, and on an attachment update the
    composite key to its message's chat and the binding check. Foreign keys on insert and the
    value checks stay the database's alone. Inserts fill the column defaults.
  - `writeSet` keeps a record naming every set field: callers pass whole entities as the set
    (`chat.repository.e2e.ts`, "update given a whole chat writes only the fields a set may
    change"), and `tsc` keeps the record in step with the `Set`.
  - Beyond the Files: `packages/testing/rows.test-util.ts` (`insertRow`, `updateRows`,
    `deleteRows`, `writeSet`, with an optional `accepts` check over the rows the write leaves),
    `kernel/data/chat/message.table.ts` (`activeMessageStatuses`, read by the index and the fake;
    the generated SQL unchanged), `docs/knowledge/architecture.md`.
  - `AttachmentRepositoryTest` reads the message it binds to through `MessageRepository`, since
    importing `MessageRows` would make the two fakes import each other.
  - Round S16.2 (review): the active reply on update, the attachment's binding guards, the
    insert defaults.
  - Size: about 560 lines (+121 / −46 tracked, 394 new), nearly all the three fakes.

#### S17 — Chat's services and the use cases over the data layer

- **Delivers:** `ChatService`, `AttachmentService` and the three use cases call the data layer's
  repositories and map with `ChatFromEntity`, `MessageFromEntity` and `AttachmentFromEntity`, now
  in `application/chat/services/`. The repository ports in chat's `domain/` and the
  `*RepositoryPg` adapters, `ChatPg` and `AttachmentPgS3`'s repository half are gone; the apps
  provide the data layer's repositories. The Postgres test stack (`RepositoryStackPgTest`,
  `insertUser` and the other row helpers) lives in `@app-template/kernel/testing-e2e`, in entities.
  Chat's arrange and read helpers in `chat.test-layer.ts` go through the mappers, and chat's
  port-level fakes (`ChatRepositoryTest`, `MessageRepositoryTest`, `AttachmentRepositoryTest`,
  its `RepositoryStackTest`) and `updateRow` in `@app-template/testing` are gone (S16).
  Every suite keeps its cases.
- **Goal:** chat's behaviour over the data layer, no port in between (R1, R3, R9, D4, D7, D14).
- **Blocked by:** S12, S16.
- **Files:** `application/chat/domain/{chat.port.ts,message.port.ts}` (deleted),
  `application/chat/domain/attachment.port.ts` (the repository half; `AttachmentBucket` stays);
  `infrastructure/{chat/chat.repository.ts,chat/message.repository.ts,attachment/attachment.repository.ts}`
  (deleted); `infrastructure/{chat,attachment}/*.mapper.ts` → `application/chat/services/`;
  `infrastructure/{chat,attachment}/index.ts`; `application/chat/services/{chat.service.ts,attachment.service.ts}`,
  `application/use-cases/chat/*.use-case.ts`; `application/{chat,use-cases}/__tests__/**`;
  `infrastructure/__e2e__/testing/{rows.test-util.ts,repository-stack.test-layer.ts}` →
  `kernel/__e2e__/testing/` (in entities); the `__e2e__` suites that use them
  (`apps/__e2e__/**`, `infrastructure/__e2e__/**`);
  `apps/api/{chat/chat.handler.ts,layer.ts,__tests__/testing/api.test-layer.ts}`,
  `apps/api/__tests__/chat/chat.handler.test.ts`,
  `apps/worker/{layer.ts,__tests__/chat/assistant-message.handler.test.ts}`,
  `apps/__e2e__/testing/stand.test-layer.ts`; `docs/knowledge/glossary.md` (it names
  `ChatRepositoryPg`), `docs/knowledge/{database,architecture}.md`.
- **Test first:** a module's services and the use cases over the memory repositories — the chat
  and attachment services' and the use cases' suites run over the kernel's memory repositories with
  every case kept; red until the services call the data layer.
- **Verify:** `make check`; `git grep -nwE "[A-Za-z]*RepositoryPg|ChatPg"` finds nothing (`ChatPgTest` is
  another word). If the diff runs
  past ~400 lines, the use cases split off as their own round.
- **Model:** `opus high`
- **Status:** done
- **Findings:**
  - The api's handlers call only services and use cases (a note on D4): `ChatService` gains
    `create` and `list`, and a new `MessageService.getOne` reads a message by its owner through
    its chat. `layering.md` › Handlers and the domain-service line say so. S21's guards should
    ban `@app-template/kernel/data/*` and the mappers in `apps/*/` but their `layer.ts`.
  - `encodeRowWith`, `decodeOptionalWith` and `decodeManyWith` in `@app-template/db` build every
    mapper's codec pair, identity's too, as the Contract's `decodeOptionalWith(ChatFromEntity)`
    has it. A write encodes the changed model and passes the row, or the fields it changes picked
    from it, as the set: `rename` writes `title` and `updatedAt` only, so a status moved since the
    read survives. The set encoders, `ChatSet` and `AttachmentSet` are gone.
  - The Postgres test stack in `infrastructure/__e2e__/testing/` is deleted, not moved to
    `@app-template/kernel/testing-e2e`: it had no importer since S9.
  - The use cases are not a round of their own: the services and the use cases share one memory
    store in the unit suites, so switching one alone breaks the other's suites.
  - `AttachmentPgS3` is `AttachmentBucketS3FromConfig`, the bucket alone, until S18.
  - `biome.json`: `application/*/__tests__` may import `@app-template/kernel/data/*`, the root
    with `Db` still banned. `ChatTest` lives in `chat.service.test.ts`, since `ChatService` now
    needs `Crypto` and the test support may not import `BunCrypto`.
  - `MessageService`'s suite (4 cases) was written after the service, with no red run.
  - Outside the step: `ChatService.delete` removes the rows, then the bytes outside the
    transaction, as before; if S3 refuses, the chat is gone and the bytes have no row left to
    retry from. A candidate for the roadmap. `infrastructure/{package,tsconfig}.json` carry dead
    dependencies, which S19 removes with the workspace.
  - Rounds S17.2 (review: `rename` through the mapper, doc lines) and S17.3 (the user: handlers
    through services, `MessageService`).
  - Size: 65 files, +591 / −1047, mostly deletions.

#### S18 — Files in the data layer

- **Delivers:** `FileRepository` (`@app-template/kernel/data/file`) inserts (answering the byte count of
  the stream it stored), selects, signs a URL for (`url`, its one verb of its own), binds
  (`update({ bound: true }, where)`) and deletes the attachments' objects under
  today's keys `attachments/<id>`, over the `S3Bucket` in the context; its doc comment states that
  the store joins no transaction. `FileEntity`, the key and the `unbound` tag live in
  `kernel/data/file`; `kernel/aws` provides `S3BucketFromConfig` (the stage's bucket from
  the inventory); `deployment` takes the tag from the data layer. The `AttachmentBucket` port,
  `AttachmentBucketS3` and `AttachmentBucketS3FromConfig` are gone: chat's services and the
  generate-assistant-message use case call `FileRepository`, `FileRepositoryTest` replaces
  `AttachmentBucketTest`. Uploads, binds, downloads and deletes behave as before.
- **Goal:** every store behind the data layer, its client from outside (R1, R3, R9, D17, D18).
- **Blocked by:** S17.
- **Files:** `infrastructure/attachment/attachment.bucket.ts` → `kernel/data/file/file.repository.ts`
  (its `S3BucketFromConfig` → `kernel/aws/aws.client.ts` as `S3BucketFromConfig`); new
  `kernel/data/file/{file.entity.ts,index.ts}`; `unboundTag` from `kernel/aws/resources` to
  `kernel/data/file/file.entity.ts`; `deployment/aws/storage.ts`, `deployment/{package.json,tsconfig.json}`;
  `application/chat/domain/attachment.port.ts` (deleted); `application/chat/services/{attachment.service.ts,chat.service.ts}`,
  `application/use-cases/chat/generate-assistant-message.use-case.ts`;
  `application/chat/__tests__/testing/attachment.test-fake.ts` (`AttachmentBucketTest` →
  `kernel/__tests__/testing/file.test-fake.ts` as `FileRepositoryTest`);
  `application/{chat,use-cases}/__tests__/**`; `infrastructure/__e2e__/attachment/attachment.bucket.e2e.ts`
  → `kernel/__e2e__/data/file/file.repository.e2e.ts` (in entities);
  `infrastructure/attachment/index.ts` gone;
  `apps/__e2e__/{chat.e2e.ts,use-cases/delete-chat.e2e.ts}` (`AttachmentBucket` →
  `FileRepository`); the key of `AttachmentBucketObjects` with its fake; `apps/{api,worker}/layer.ts`,
  `apps/api/__tests__/testing/api.test-layer.ts`, `apps/__e2e__/testing/stand.test-layer.ts`;
  `kernel/package.json` (`@app-template/s3`); `bun.lock`; `.claude/rules/layering.md` (the order
  rule names the object store's repository), `.claude/rules/naming.md` (no `.bucket` row),
  `.claude/rules/deep-modules.md` (a store's own verb only where the shape differs; a write that
  measures a stream answers the measure),
  `docs/knowledge/{aws,database}.md`.
- **Test first:** a repository on MiniStack — the file suite (an upload is tagged `unbound`, a bind
  removes the tag, a delete removes many) passes over `FileRepository`, red until it exists; the
  services' suites over `FileRepositoryTest` keep every case.
- **Verify:** `make check`; `git grep -nE "AttachmentBucket" -- ':!docs/tickets'` finds nothing;
  `make dev`: upload a file, send it, open its link, delete the chat.
- **Model:** `opus high`
- **Status:** done
- **Findings:**
  - The delete's where is `FileEntityDeleteWhere`, not the Contract's `FileEntityManyWhere`
    (`naming.md`'s `<Verb>Where`). The order against S3 is as before: the bytes before the row that
    binds them, deleted once the rows are gone; the Contract and D17 now say so (a note on D18).
  - `S3BucketOfStage` is the one place that names the stage's bucket; `S3BucketFromConfig` closes
    it over the config, and `AwsTest` reuses it.
  - `FileRepository`'s writes never die on a missing file, unlike a table's: S3 is idempotent, as
    the port was; `deep-modules.md` states the exception.
  - `FileRepositoryTest` sits inside `RepositoryStackTest`, its bytes in `FileObjects`.
  - `AttachmentMeta` is gone with the port; `AttachmentUpload<E>` picks from `Attachment`.
  - Beyond the Files: `apps/__e2e__/testing/chat.test-layer.ts`,
    `kernel/__e2e__/testing/aws.test-layer.ts`, `kernel/__tests__/testing/*`,
    `kernel/aws/resources/index.ts`, `kernel/tsconfig.json`, `infrastructure/{package.json,
    tsconfig.json,CLAUDE.md}` (the `./attachment` export and its S3 dependencies gone),
    `kernel/CLAUDE.md`, `docs/knowledge/{architecture,glossary}.md`.
  - `deployment/aws/storage.ts` imports `@app-template/kernel/data/file` for the unbound tag, which
    also loads the S3 client into the Pulumi program.
  - `make bundle-check` does not yet know the data layer's keys, so a `FileRepository` import into
    the web app passes it until S19 sets the final pattern.
  - The review's silent-failure pass found three gaps older than this ticket (a lost file dropped
    from the reply's history, a bind over a missing object, untagged bytes after a send's
    rollback): the roadmap's 24 `attachment-storage-failures`, on the user's word. The bytes of a
    deleted chat whose delete fails are 22 `jobs`'.
  - The by-hand Verify ran `make reset` in the main tree: the local database predated S10's single
    migration.
  - Round S18.2 (review): doc lines re-wrapped, the e2e's layer inlined, the `deep-modules.md`
    clause.
  - Size: 48 files, +409 / −376; three moves git reads as delete and add.

#### S19 — Chat's assistant in its module

- **Delivers:** chat's adapter of the assistant, with its prompts, lives in
  `application/chat/infrastructure`. `CurrentReplyProvenance` and `ReplyProvenance` move to chat's
  `domain/`, beside `Assistant`, and their config layer stays in `infrastructure/` as
  `CurrentReplyProvenanceFromConfig`. The queue definitions live in `application/chat/services`
  and take their names from `@app-template/kernel/aws/resources`. The `infrastructure` workspace
  is gone; no service is keyed in a module's `infrastructure/`, whose adapters carry their
  ports' keys; `make bundle-check` greps only the new forms. `application/CLAUDE.md` takes `infrastructure/CLAUDE.md`'s rules.
- **Goal:** chat whole in its module; the old layer workspaces gone (R2, R6, R7, R8, R16, D1, D4).
- **Blocked by:** S7, S10, S18.
- **Files:** `infrastructure/chat/assistant.llm.ts` → `application/chat/infrastructure/`;
  `CurrentReplyProvenance` (from `assistant.llm.ts`) and `ReplyProvenance` (from `chat.queue.ts`)
  → `application/chat/domain/assistant.port.ts`; `infrastructure/chat/chat.queue.ts` →
  `application/chat/services/`; `infrastructure/__tests__/testing/chat.test-fake.ts` merged into
  `application/chat/__tests__/testing/assistant.test-fake.ts` (`CurrentReplyProvenanceTest` beside
  `recordAssistant`); new `application/chat/infrastructure/index.ts`; the `unboundLifetime` case of
  `infrastructure/__tests__/shared/resources.test.ts` → `application/chat/__tests__/services/`;
  `infrastructure/__tests__/chat/*` → `application/chat/__tests__/infrastructure/`;
  `infrastructure/{package.json,tsconfig.json,CLAUDE.md,*/index.ts}` gone;
  `application/chat/{package.json,tsconfig.json}` (`./infrastructure`, `#infrastructure/*`); every
  importer of `@app-template/infrastructure/*` in `application/*`, `apps/*`; root `package.json`
  and `tsconfig.json`; `biome.json` (`infrastructure/**` override gone,
  `application/*/infrastructure/**` copying it); `Makefile` (`bundle-check` final pattern);
  `application/CLAUDE.md`; `bun.lock`; `CLAUDE.md` (Map), `.claude/rules/{layering,deep-modules}.md`
  (`paths:` globs naming `infrastructure/**`), `.claude/rules/naming.md` (the `.queue` row in
  `services`; `.llm` in a module's `infrastructure`), `.claude/rules/effect-services.md` (the line
  on reading `Config`), `docs/knowledge/{architecture,ai,aws,database,tooling}.md`, `README.md`.
- **Test first:** `config only` — a move: the `AssistantLlm` suite, the worker handlers and the
  journey pass at their new paths.
- **Verify:** `make check`; `git grep -n "@app-template/infrastructure"` finds nothing;
  `ls infrastructure` fails; `make bundle-check` fails on throwaway imports of `FileRepository`,
  `SendMessageUseCase` and the `Assistant` port into the web app, the last two with throwaway web
  dependencies on `@app-template/chat` and `@app-template/use-cases` (all reverted).
- **Model:** `opus medium`
- **Status:** done
- **Findings:**
  - No key reads `'@app-template/chat/infrastructure/<Name>'`, as the Delivers first said:
    `CurrentReplyProvenance` is a port of chat's domain, keyed
    `'@app-template/chat/domain/CurrentReplyProvenance'`, and the adapter is a `Layer` caught
    through the domain keys it carries. The Delivers now says so.
  - Without web dependencies on `@app-template/chat` and `@app-template/use-cases`, a throwaway
    import fails `bun build` on resolution before the grep runs, so the pattern stays untested;
    the Verify now names them. `FileRepository` needs none: the web app depends on the kernel.
  - A module's `services/**` may import `@app-template/aws`, `@app-template/queue` and
    `@app-template/kernel/aws/resources`, which the queue definitions need, and its tests
    `kernel/aws/resources`; the matrix allows them.
  - A new override `application/*/__tests__/infrastructure/**` lets the adapter's suite import
    `@effect/ai-anthropic`'s types, which the module's tests override bans.
  - For S21: the `application/*/infrastructure/**` override, copied from the old one, passes
    `#services/**` and other modules though its message bans them, and the use cases' override
    does not ban `@app-template/*/infrastructure`; both predate this step.
  - `application/CLAUDE.md`'s "No I/O" now reads over the module's `infrastructure/` too, where the
    adapter calls `HttpClient`: S20 or S22 words it.
  - The moved files import through `#domain/*` and `#testing/*`, not the package's own name; the
    adapter's `describe` is `CurrentReplyProvenanceFromConfig`.
  - `layering.md` was untouched: its `paths:` names no `infrastructure/**`.
  - Beyond the Files: `.claude/skills/explain/REPORT.md`, `docs/knowledge/glossary.md`, the
    module row of `docs/knowledge/architecture.md`'s matrix (stale since S17), the use cases'
    Biome message. `.github/PULL_REQUEST_example.md` still names the old layers; it is an example.
  - Round S19.2 (review): `aws.md`'s queue line, `REPORT.md`'s wrap, the Biome row of Boundary
    guards.
  - Size: 57 files, +275 / −355.

#### S20 — The decisions document and the modules rule

- **Delivers:** `docs/knowledge/decisions.md`, the living decisions document: one record per
  decision of `architecture.md › Decisions`, each with its reason and sources, the rejected
  alternatives, its costs, what guards it, what breaks if it is reversed and when to revisit it,
  records named by title (`make ids` refuses ticket ids outside `docs/tickets/`). The deviations
  from the guide (one data layer for every module, every module writing any record, the HTTP layer
  outside the modules, a transaction across modules) are recorded as such. A new review rule
  `.claude/rules/modules.md` lists what no tool checks (a cycle of modules through their contracts,
  a service rule or a model in the kernel, another module's rule copied instead of called, a rule
  in a use case), each naming its record. `CLAUDE.md` points to the document and tells a session
  about to change a boundary, the data layer, the kernel, a guard or a recorded decision to read
  its record and state the consequences first.
- **Goal:** every decision recorded where a session reads it before changing a boundary (R13, R18,
  R20, D12, D15, D16).
- **Blocked by:** S19.
- **Files:** new `docs/knowledge/decisions.md`; new `.claude/rules/modules.md` (`paths:`
  frontmatter over `application/**` and `kernel/**`, at most ~80 lines); `CLAUDE.md`;
  `.claude/rules/claude-md.md` and `docs/knowledge/sdd.md` (they name only the commit's
  `Decision:` and the ticket's `architecture.md` as homes of a decision).
- **Test first:** `config only` — docs.
- **Verify:** `make check` (`make ids`, `make doc-names`); each record has the seven fields; every
  item of `modules.md` names a record that exists.
- **Model:** `opus high`
- **Status:** todo

#### S21 — The guards per ring and layer

- **Delivers:** `biome.json` holds the overrides of `architecture.md › Contracts`, one per ring and
  layer, each message naming its record in `decisions.md`. A throwaway import of another module's
  internals, of an undeclared workspace, of a module into the kernel or a package, of the kernel
  into a module's domain or a contract, of `@app-template/kernel/llm` or `#infrastructure/…` into
  a module's services, of `@app-template/kernel/postgres` into a use case, of a model,
  `#kernel/aws` or `@app-template/kernel/config` into a data-layer file, of the kernel into a
  package, and of e2e support into a unit test each fails `make check` with the decision named.
- **Goal:** the build refuses what points outward or across (R7, R8, R12, R13, R14, R15, R16, R17,
  R20, D12).
- **Blocked by:** S20.
- **Files:** `biome.json`; `docs/knowledge/tooling.md` if it describes the overrides.
- **Test first:** `make check` with a throwaway import (the Seam) — each throwaway of
  `feature.md › Acceptance` R12–R17 fails with its decision named; red today for those no override
  refuses yet (a data-layer file importing `#kernel/aws`).
- **Verify:** `make check`; each throwaway run and reverted, its output pasted in the step report.
- **Model:** `opus medium`
- **Status:** todo

#### S22 — The architecture page for the rings

- **Delivers:** `docs/knowledge/architecture.md` describes the three rings, the dependency rules
  (the table of what may import what and the guard of each cell), how to add a module (the
  checklist: workspace globs, the Biome lists that name module packages, a nested contract's
  `exclude` and reference), how to add an entity (its folder in `kernel/data`, its mapper and model
  in the module), how to add a store's client (the data layer names it, the kernel builds it, the
  process provides it), where tests live, and the shape of a use case with a short snippet,
  including when a rule is called and when it is a module's own (D16). Every rule and `CLAUDE.md`
  line that restates it is trimmed to a pointer.
- **Goal:** the docs say how the code is cut and how to extend it (R18, R19).
- **Blocked by:** S21.
- **Files:** `docs/knowledge/architecture.md`; `.claude/rules/{layering,naming,deep-modules,effect-services,effect-tests}.md`,
  `CLAUDE.md`, `application/CLAUDE.md`, `kernel/CLAUDE.md`, `packages/CLAUDE.md`,
  `http-api/CLAUDE.md`, `apps/CLAUDE.md` where they restate it.
- **Test first:** `config only` — docs.
- **Verify:** `make check` (`make doc-names`); the page has the seven sections.
- **Model:** `opus high`
- **Status:** todo

#### S23 — The glossary, the placeholders, the roadmap and the rest

- **Delivers:** the glossary adds "Data layer", "Entity" (the data layer's record, never a
  model) and "Boundary", and rewrites "Application", "Module", "Module contract", "Use case",
  "Kernel", "Model" and "Package" for the rings ("Component" stays banned); the rules' `<Entity>` placeholders and the domain's "entity"
  read `<Model>` and "model"; the roadmap marks entry 23 done and tells `shared-files`,
  `assistant-files` and `jobs` what they inherit; `database.md`, `tooling.md`, `ai.md`,
  `aws.md`, `README.md` and the explainer's report template read as written for the rings, naming
  nothing that is gone.
- **Goal:** one word per concept, no doc naming what is gone (R19, D8).
- **Blocked by:** S22.
- **Files:** `docs/knowledge/{glossary,roadmap,database,tooling,ai,aws}.md`, `README.md`,
  `.claude/skills/explain/REPORT.md`;
  `.claude/rules/{claude-md,deep-modules,effect-schema,effect-services,effect-style,effect-tests,naming}.md`,
  `http-api/CLAUDE.md` (the `<Entity>` placeholders).
- **Test first:** `config only` — docs.
- **Verify:** `make check`; `git grep -n "<Entity>"` finds nothing outside `docs/tickets/`;
  `git grep -nP "@app-template/(domain|infrastructure|application|config|e2e)\b|packages/config/" -- '*.md' ':!docs/tickets'`
  finds nothing.
- **Model:** `opus high`
- **Status:** todo

## Requirement coverage

| Req | Steps |
|---|---|
| R1 | S11, S13, S17, S18, S19 (every step keeps the suites green) |
| R2 | S7, S10, S19 |
| R3 | S17, S18 |
| R4 | S6, S8, S10 |
| R5 | S6, S8, S10 |
| R6 | S3, S4, S5, S6, S7, S11, S13, S19 |
| R7 | S11, S19, S21 |
| R8 | S3, S13, S19, S21 |
| R9 | S8, S9, S10, S12, S14, S15, S17, S18 |
| R10 | S10 |
| R11 | S1 |
| R12 | S21 |
| R13 | S4, S20, S21 |
| R14 | S8, S21 |
| R15 | S4, S21 |
| R16 | S11, S13, S19, S21 |
| R17 | S1, S21 |
| R18 | S20, S22 |
| R19 | S22, S23 |
| R20 | S20, S21 |
