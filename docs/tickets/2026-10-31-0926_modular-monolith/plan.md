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
| S20 | the decisions document and the modules review rule | done |
| S21 | the Biome guards per ring and layer | done |
| S22 | `architecture.md` rewritten for the rings | done |
| S23 | the glossary, the `<Model>` placeholders, the roadmap and the remaining pages | done |
| S24 | the statuses through the mapper e2e; the test layers' `provideMerge` in the rule | done |
| S25 | the kernel's tests beside each of its parts | done |
| S26 | the apps' layers exported to the e2e as test support | done |
| S27 | `packages/` one workspace; the kernel's parts one entry each | done |
| S28 | e2e support in `__tests__/testing/e2e/` | done |
| S29 | `application/` one workspace, one entry per module | done |
| S30 | a Biome list per workspace | done |
| S31 | the mappers' e2e beside the mappers; the use cases' e2e through the api | done |
| S32 | test support beside its one user | done |
| S33 | the test layout told in one place | done |
| S34 | the mappers checked by unit tests over the schemas | done |
| S35 | `apps/__e2e__` → `apps/e2e`, a test app | done |
| S36 | the branch review's test fixes | done |
| S37 | the docs the branch review found out of step with the code | done |
| S38 | the chat module in one shape | done |
| S39 | `biome.json` keeps only the import rules nothing else holds | done |
| S40 | R1 names the three answers S38 changed | done |
| S41 | `packages/` reaches no app ring; the HTTP contract held by a snapshot | done |
| S42 | the verification's small fixes in docs, tests and chat's code | done |

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
- **Status:** done
- **Findings:**
  - 20 records, one per decision, each with the seven fields; titled by the decision ("Jobs as a
    table in the data layer"), so no ticket id leaves `docs/tickets/`. The four departures from
    the guide are listed up front and marked in their sources.
  - `modules.md` has a fifth item beyond the four named: a job reacting to another module's write
    (R18), which no tool checks. R20's "every review rule names a record" reads as its items.
  - The records name the guards of the Contracts' end state, the overrides S21 adds included;
    S21 edits a record whose guard diverges (`decisions.md` joins its Files).
  - D13 and D14 had no rejected alternative; their records name one, now in `architecture.md`.
  - The use case's record and `modules.md` keep the allowance of `layering.md › Use cases`: a
    use case reads or writes a repository where no rule applies.
  - Round S20.2 (the user's word): the ticket process keeps the page current — `sdd.md`'s gate,
    `/ticket-architecture` naming the record a decision adds or changes, `/ticket-implement`
    writing it on approval, `docs/knowledge/sdd.md`'s map.
  - Left: `application/CLAUDE.md`'s "No I/O" over a module's `infrastructure/` to S22; the
    `README.md` and `architecture.md` lines naming only tickets as the home of decisions to S23
    and S22.
  - Over budget, kept one step on the main session's call: docs only, and a split would leave
    `modules.md` pointing at records outside its diff.
  - Size: 8 files, about +540 / −10 (`decisions.md` 454 lines, `modules.md` 60).

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
- **Files:** `biome.json`; `docs/knowledge/tooling.md` if it describes the overrides;
  `docs/knowledge/decisions.md` where a guard diverges from its record's Guarded by.
- **Test first:** `make check` with a throwaway import (the Seam) — each throwaway of
  `feature.md › Acceptance` R12–R17 fails with its decision named; red today for those no override
  refuses yet (a data-layer file importing `#kernel/aws`).
- **Verify:** `make check`; each throwaway run and reverted, its output pasted in the step report.
- **Model:** `opus medium`
- **Status:** done
- **Findings:**
  - Today's code passes every new override; nothing moved. Each throwaway of R12–R17 and of the
    gaps S11, S18 and S19 handed on passed the old `biome.json` and fails the new one with its
    record named; R12's undeclared workspace is `tsc`'s (TS2307), R16's the bundle check's.
  - Beyond the Contracts, on the main session's word: a `deployment/**` override (the kernel
    only `/config`, `/aws/resources`, `/data/file`) and `apps/{api,worker}/**` (no data layer, no
    mapper but in `layer.ts`); both rows and two matrix cells now in `architecture.md`.
  - A message names every record its pattern guards: Biome reports each matching pattern, so a
    pattern per record would print several errors for one import.
  - The apps' mapper ban matches import names (`*FromEntity`, `encode*`, `decode*`): mappers ship
    in the module's `./services` beside the services, so a mapper named otherwise passes.
  - R20 for every guard: the relative-path ban and the apps' independence got records,
    "Imports through subpaths" and "Independent apps"; 75 messages, none without a record.
  - The use cases' source refuses a module's `./testing`, which the matrix never allowed.
  - `kernel/data/**` and a module's `services/**` allow-list packages, and seven lists name the
    module packages: `tooling.md` says what a new package and a new module change.
  - Run in worktree N=1 beside S22; rounds S21.1 (the overrides) and S21.2 (review: the two
    records, the `./testing` ban, `tooling.md`).
  - Size: 3 files, +337 / −79.

#### S22 — The architecture page for the rings

- **Delivers:** `docs/knowledge/architecture.md` describes the three rings, the dependency rules
  (the table of what may import what and the guard of each cell), how to add a module (the
  checklist: workspace globs, the Biome lists that name module packages, a nested contract's
  `exclude` and reference), how to add an entity (its folder in `kernel/data`, its mapper and model
  in the module), how to add a store's client (the data layer names it, the kernel builds it, the
  process provides it), where tests live, and the shape of a use case with a short snippet,
  including when a rule is called and when it is a module's own (D16). Every rule and `CLAUDE.md`
  line that restates it is trimmed to a pointer. `application/CLAUDE.md`'s "No I/O" excepts a
  module's `infrastructure/`, and the page's intro names `decisions.md` as the home of the living
  decisions.
- **Goal:** the docs say how the code is cut and how to extend it (R18, R19).
- **Blocked by:** S21.
- **Files:** `docs/knowledge/architecture.md`; `.claude/rules/{layering,naming,deep-modules,effect-services,effect-tests}.md`,
  `CLAUDE.md`, `application/CLAUDE.md`, `kernel/CLAUDE.md`, `packages/CLAUDE.md`,
  `http-api/CLAUDE.md`, `apps/CLAUDE.md` where they restate it.
- **Test first:** `config only` — docs.
- **Verify:** `make check` (`make doc-names`); the page has the seven sections.
- **Model:** `opus high`
- **Status:** done
- **Findings:**
  - The seven sections stand beside the kept "Imports", "Where things live" and "Boundary
    guards", whose anchors other docs link.
  - The dependency table names its guard per row: each refused cell of a row is that row's
    override's; it follows S21's `biome.json`, `deployment/**` and the apps' `layer.ts` included.
  - The use-case snippet is hypothetical (no flow spans two modules today); it deletes the files
    after the transaction commits, since the object store joins none.
  - The rewrite had dropped two instructions stated nowhere else (a new group joins `Api` before
    `.middleware(SchemaErrors)`; ownership is a `where` field); the checklists carry them again.
  - One home per fact: the domain's browser constraints and the data layer's own types stay in
    their `CLAUDE.md`, the page points there; a store's client stays on the page.
  - Untouched: `layering`, `deep-modules`, `effect-services`, `effect-tests`, `http-api/` and
    `packages/CLAUDE.md`: rules the page points to, not restatements.
  - Left to S23: `README.md` names only the tickets as the home of decisions.
  - Run in the main tree beside S21 (N=1), synced with its guards before the commit; over budget,
    kept one step: one page rewritten. Rounds S22.2 and S22.3 (review, the S21 sync).
  - Size: 6 files, +360 / −245.

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
- **Status:** done
- **Findings:**
  - A placeholder follows what it names: `<Model>` for a domain name, its mapper
    (`<Model>FromEntity`) and its domain service (`<Model>Service`); `<Name>Entity…`,
    `<Name>Repository` and `<Name>Rows` for the data layer; `<Port><Problem>Error` for a port's
    error; `<name>` for a file name both rings share.
  - The glossary's domain service no longer "owns its model's writes": any module writes any
    record ("Records open, rules called"); `layering.md`'s "owns its model's records for every
    caller above it" is the S17 decision and stays.
  - Beyond the Files: `application/CLAUDE.md`, `layering.md` and `CLAUDE.md` (placeholders and
    "visitor" → "user"), `docs/knowledge/architecture.md` (its mapper and service placeholders),
    the roadmap's intro and its `web-app` and `client-publishing` entries.
  - `ai.md` needed nothing: it names nothing gone (checked with the Verify greps).
  - Kept: the lowercase `<entity>` in `architecture.md`, a file name of the data layer;
    `.github/PULL_REQUEST_example.md`, a copy of a real merged PR; the roadmap's history lines
    that say "visitor".
  - Round S23.2 (review: placeholders, "visitor", the domain service's writes).
  - Size: 19 files, +219 / −153.

#### S24 — The statuses through the mappers; the test layers in the layers rule

- **Delivers:** the chat mapper's e2e writes every chat and message status through its mapper to
  Postgres and reads it back, so a status the model and the database's enum hold apart fails a
  test; `effect-services.md › Layers` names a test layer, which merges what its cases read,
  beside the transaction's client as the exception to `Layer.provideMerge`.
- **Goal:** D11's cost holds as written: every rule kept twice has the e2e that catches its drift
  (verification run 1, Spec 1 and Standards 1).
- **Blocked by:** S23.
- **Files:** `apps/__e2e__/mappers/chat.mapper.e2e.ts`, `.claude/rules/effect-services.md`.
- **Test first:** `apps/__e2e__/mappers/chat.mapper.e2e.ts`: a case per entity, over every value
  of `ChatStatus` and `MessageStatus`, through the existing insert and read; no new helper.
- **Verify:** `make check`; dropping a value from a `pgEnum` in a throwaway edit fails the case.
- **Model:** `opus medium`
- **Status:** done
- **Findings:**
  - One case per value with `it.effect.each`, each on a database of its own, not one loop per
    entity (`effect-tests.md`): a failing case names its value, and one message per database lets
    the assistant write every status despite the active-message index.
  - The authors cross the mapper too: `message_author` is a third literal set kept twice. The
    user's case is written out beside the assistant's statuses, not crossed with them, so a dropped
    status turns one case red, not two.
  - Probes: dropping `failed` from `chat_status`, `generating` from `message_status` and `user`
    from `message_author` each turned exactly its case red with a `SchemaError`, the other 8 green.
  - Beyond the Files: `docs/knowledge/decisions.md` (the record's Guarded by) and
    `docs/knowledge/database.md`, which describe this e2e; a drift fails the write or the read
    back through the schemas, not a write the database refuses.
  - Round S24.2 (review: `it.effect.each`, fixed ids, the authors, the docs).
  - Size: 4 files, +89 / −19.

#### S25 — The kernel's tests beside each of its parts

- **Delivers:** each part of the kernel keeps its own tests, as each package does:
  `kernel/data/__e2e__/<store>/` and `kernel/data/__tests__/testing/` (the memory repositories),
  `kernel/postgres/__e2e__/`, `kernel/queue/__e2e__/`, `kernel/config/__tests__/`, and the e2e
  support beside the part it builds (`DbTest` and the job fixture with the data, `AwsTest` with
  `aws`); no `kernel/__tests__/` or `kernel/__e2e__/` is left. The support is exported per part
  (`@app-template/kernel/data/testing`, `…/data/testing-e2e`, `…/aws/testing-e2e`), and every
  importer, the Biome overrides on the kernel's tests, `vitest.config.ts`'s `globalSetup` and
  the docs follow.
- **Goal:** the user's word after verification: the kernel's parts are units like packages, so
  their tests sit with them (D19 amended; `decisions.md › Tests in their folders` rewritten).
- **Blocked by:** S24.
- **Files:** the 24 files under `kernel/__tests__/` and `kernel/__e2e__/` (moved);
  `kernel/package.json`, `kernel/tsconfig.json` if it lists them; every file importing
  `@app-template/kernel/testing`, `…/testing-e2e`, `#testing/*` or `#testing-e2e/*` of the kernel
  (`git grep`); `biome.json` (the `kernel/__tests__/**` override and any pattern naming the
  kernel's test exports); `vitest.config.ts`; `docs/knowledge/{architecture,aws,database,
  decisions,tooling}.md`, `.claude/rules/effect-tests.md` and `kernel/CLAUDE.md` where they name
  the paths; the ticket's `architecture.md` D19 note is the main session's.
- **Test first:** `config only` — a move; every case and assertion kept (D14).
- **Verify:** `make check`; `find kernel -maxdepth 1 -name '__*'` finds nothing; a throwaway
  import of the data's `testing-e2e` support into `kernel/data/__tests__/` fails Biome naming
  "Tests in their folders".
- **Model:** `opus medium`
- **Status:** done
- **Findings:**
  - The aliases are `#testing/<part>/*` and `#testing-e2e/<part>/*`, so the `#testing-e2e/**`
    ban in every unit-test override still catches them.
  - The e2e run's `globalSetup` stays one file, in `kernel/data/__e2e__/testing/`: vitest runs
    `globalSetup` files one after another, so a split would start Postgres and MiniStack in turn.
    It also starts the MiniStack every workspace's e2e needs, a cost `decisions.md` records.
  - Beyond the Files, in `biome.json`: the e2e-support ban widened to
    `@app-template/**/testing-e2e` (a probe shows `**` also matches one segment); a
    `kernel/*/__e2e__/**` override, since the data's e2e arranges through `#kernel/aws` and
    `#kernel/config` as before; the services and use-case source overrides ban the kernel's part
    support, which the `!@app-template/kernel/data/*` exceptions would otherwise open.
  - Also beyond the Files: `.claude/rules/naming.md` (the mirror rule for a kernel part's own test
    folders); `kernel/CLAUDE.md` named no moved path.
  - Round S25.2 (review): a `kernel/data/__tests__/**` override after `kernel/*/__tests__/**`
    restores the data layer's bans on the memory repositories, which the later override had
    replaced.
  - Size: 49 files, +311 / −148, most of it `biome.json`'s repeated ban lists.

#### S26 — The apps' layers exported to the e2e as test support

- **Delivers:** `apps/api` and `apps/worker` export `./testing` in place of `./layer`:
  `apps/api/__tests__/testing/api.test-layer.ts` re-exports `ApiLayer` as `ApiLayerTest`, a new
  `apps/worker/__tests__/testing/worker.test-layer.ts` re-exports `WorkerLayer` as
  `WorkerLayerTest`, each behind an `index.ts`; the journey's `stand.test-layer.ts` imports them
  from `@app-template/api/testing` and `@app-template/worker/testing`; `main.ts` keeps its
  `layer.ts`.
- **Goal:** what only the tests use is test support, not an app's interface (`deep-modules.md ›
  Caller`); the user's word after verification.
- **Blocked by:** S25.
- **Files:** `apps/{api,worker}/package.json`, `apps/api/__tests__/testing/api.test-layer.ts`,
  `apps/worker/__tests__/testing/{worker.test-layer,index}.ts`, `apps/api/__tests__/testing/index.ts`,
  `apps/__e2e__/testing/stand.test-layer.ts`, `apps/CLAUDE.md`, and every doc `git grep` finds naming `./layer`,
  `api/layer` or `worker/layer`.
- **Test first:** `config only` — every case and assertion kept (D14).
- **Verify:** `make check`; `git grep -nE "@app-template/(api|worker)/layer"` finds nothing
  outside the tickets; a throwaway import of `@app-template/worker/testing` into `apps/api/` fails Biome
  naming "Independent apps".
- **Model:** `opus medium`
- **Status:** done
- **Findings:**
  - `biome.json` needed no change: no override names `/layer` as an import, and the Independent
    apps bans on `@app-template/<app>/**` cover `./testing` (a throwaway import of
    `@app-template/worker/testing` into `apps/api/` fails naming the record).
  - The names end in `Test` so `\w+Test\b` finds them, though they are the real process layers;
    exporting `ApiLayer` unaliased from `index.ts` was the review's plainer alternative, not taken.
  - An app's unit support can reach its real layer, as it already did through `#api/layer` for
    `ApiHttp`; the e2e-support ban is unchanged.
  - Verify's grep was narrowed to `@app-template/(api|worker)/layer`: the written one matched the
    internal `#api/layer` imports `main.ts` keeps.
  - Size: 10 files, about +30 / −21.

#### S27 — The packages one workspace; the kernel's parts one entry each

- **Delivers:** `packages/` becomes one workspace, `@app-template/packages` (the root
  `workspaces` lists `packages` for `packages/*`): one `package.json` merging the packages'
  dependencies, with an export per package (`./aws`, `./db`, `./llm`, `./queue`, `./s3`,
  `./testing`, `./ui`) and its support (`./db/testing`, `./queue/testing`, `./db/testing-e2e`
  until S28), and internal aliases named for their package (`#db/*`, `#testing/db/*`, as the
  kernel's `#testing/data/*`). The kernel's `exports` shrink to one per part (`./config`,
  `./postgres`, `./aws`, `./data`, `./llm`, `./queue`) and its support: `kernel/data/index.ts`
  re-exports every store, `kernel/aws/index.ts` the inventory. A unit reaches another only
  through its entry, `@app-template/<unit>` or `<unit>/testing`, never a file of it: the
  kernel's parts stop importing each other's files through `#kernel/<part>/…` (about 30) and
  Biome refuses it; `#` aliases stay for a unit's own files. Every import of these units is
  rewritten (about 170 in 120 files), Biome's patterns name the new specifiers, and the
  `@app-template/packages` dependency replaces the per-package ones. Each package keeps its own
  `tsconfig.json` project if `tsc -b` still checks the references between them; else one project,
  recorded. No `paths`, no change to `vitest.config.ts`. `make bundle-check` is proven still to
  catch a service.
- **Goal:** R21, D21, D5's note; the user's word on 2026-11-02.
- **Blocked by:** S26.
- **Files:** `package.json` (root `workspaces`), `packages/package.json` (new) and the
  packages' manifests (gone), `packages/*/tsconfig.json`, `tsconfig.json`, `bun.lock`,
  `kernel/package.json`, `kernel/{data,aws}/index.ts`, `Makefile` (`bundle-check`, if its
  pattern needs it), `biome.json`, every `*.ts` importing `@app-template/{kernel,aws,db,llm,queue,s3,testing,ui}`,
  every `package.json` declaring a package, `docs/knowledge/decisions.md › Imports through
  subpaths` (rewritten: imports by folder) and `› One kernel`, and every doc, rule, `CLAUDE.md`
  and skill `git grep` finds naming an old specifier.
- **Test first:** `config only` — every case and assertion kept (D14).
- **Verify:** `make check`; `git grep -nE "'@app-template/(kernel/data/(attachment|chat|file|job|user)['/]|kernel/aws/resources|(aws|db|llm|queue|s3|testing|ui)['/])" -- ':!docs/tickets' ':!repos'`
  finds only the repositories' service keys; a throwaway import of `ChatService` into `apps/web/app/main.ts` fails
  `make bundle-check` (R16); one of `@app-template/packages/db` into a workspace that does not
  declare `@app-template/packages` fails `tsc -b`.
- **Model:** `opus medium`
- **Status:** done
- **Findings:**
  - Rewritten mid-step on the user's word: no `paths` (D21's probe kept as the rejected
    alternative); a unit reached only through its entry, the kernel's parts too (28 imports from
    `#kernel/<part>/…`; `kernel/data/testing-e2e` gained `SampleJob`, `sampleJobQueue`,
    `sampleProvenance`); service keys `'@app-template/<folder>/<Name>'`, the file's folder from
    the root (`effect-services.md`): the kernel's unchanged, the packages' gain `packages/`.
  - Each package keeps its `tsconfig.json`: an import of `@app-template/packages/db` or `#db/id`
    from `packages/ui` fails `tsc -b` with TS6059/TS6307; one of `@app-template/packages/db`
    into `http-api`, which does not declare the workspace, fails with TS2307.
  - One entry opens a part whole, so the old subpath limits are held by imported name
    (`importNamePattern`, matched whole by Biome, which refuses `^`/`$`): modules' services and
    tests take no `Db`, `relations`, `migrationsFolder` of `/data` and no `*FromConfig`,
    `*OfStage` of `/aws`; deployment takes only `unboundTag` of `/data`, stricter than before.
    Kept on the user's word; review found `migrationsFolder` open, closed in this step.
  - A Biome override per kernel part refuses another part's files, since Biome replaces the
    options of two matching overrides; a gap: a future `kernel/{aws,llm,postgres,queue}/__tests__`
    falls under the generic tests override, with no cross-part ban.
  - `kernel/data/migrations.ts` builds its folder with `join(import.meta.dirname, …)`:
    `node:url`'s browser polyfill lacks `fileURLToPath`, so a data leak failed the web build
    before the bundle grep could name it. `bundle-check`'s pattern needed no change; the web
    bundle is byte-identical; a `ChatService` imported by path or through `http-api` is named.
  - `packages/llm/index.ts` is new (its entry was `client.ts`); `"sideEffects": false` of
    `packages/db` was not carried over, with no bundle change. After the manifests moved,
    `tsc -b` needed `node_modules/.cache/tsc` removed once.
  - Verify's grep was narrowed: the `/data/testing` entries and the repositories' keys match it.
  - The `testing-e2e` move left S29 for S28 on the user's word; the application became S29, the
    lists S30.
  - Size: 134 files, about +675 / −496 without `bun.lock` (≈390 lines of `biome.json`), past
    the ~400 limit through the mid-step decisions; kept one commit on the user's word.

#### S28 — E2e support in `testing/e2e`

- **Delivers:** the e2e support of `kernel/data`, `kernel/aws` and `packages/db` moves from
  `__e2e__/testing/` to `__tests__/testing/e2e/`, names unchanged, behind an `index.ts` that
  `__tests__/testing/index.ts` does not re-export; the exports `<unit>/testing/e2e` and the
  aliases `#testing/<unit>/e2e/*` replace `/testing-e2e` and `#testing-e2e/<unit>/*`, and the
  unit-test bans follow them (R17). The shared `packages/testing/` keeps only the support its
  units share (clock, logs, order, PNG, schema, stream, UUID, the HTTP cookie jar); a package's
  own support moves into it, on the user's word: `rows.test-util.ts` (the memory fakes' row
  helpers) to `packages/db/__tests__/testing/`, `postgres.test-layer.ts` to
  `packages/db/__tests__/testing/e2e/`, `aws.test-{layer,util}.ts` (MiniStack clients, region,
  stage) to `packages/aws/__tests__/testing/e2e/`, exported as `packages/aws/testing/e2e`.
- **Goal:** R11 and R17 as amended; D19's note.
- **Blocked by:** S27.
- **Files:** `biome.json`, `kernel/package.json`, `packages/package.json`, the moved support
  files (with `packages/testing/{index,rows.test-util,postgres.test-layer,aws.test-layer,
  aws.test-util}.ts`), `packages/s3/tsconfig.json` (a reference to `../aws`, whose MiniStack
  client its e2e takes until S30), `vitest.config.ts` (`globalSetup`), every file importing them,
  `.claude/rules/{effect-tests,naming}.md`, `docs/knowledge/decisions.md › Tests in their
  folders`, `docs/knowledge/{architecture,tooling}.md`, and every doc `git grep` finds naming
  `testing-e2e` or a moved file.
- **Test first:** `config only` — every case and assertion kept (D14).
- **Verify:** `make check`; `git grep -n "testing-e2e" -- ':!docs/tickets' ':!repos'` finds
  nothing; `packages/testing/` holds no `aws`, `postgres` or `rows` file; throwaway imports of `#testing/data/e2e/db.test-layer` into a kernel unit test and of
  `@app-template/kernel/data/testing/e2e` into a module's unit test each fail Biome naming the
  record (R17).
- **Model:** `opus medium`
- **Status:** done
- **Findings:**
  - Extended mid-step on the user's word: a package's own support moved into that package
    (`rows` to `packages/db/testing`, `PgClientTest` to `packages/db/testing/e2e`, the MiniStack
    clients to the new `packages/aws/testing/e2e`); `packages/s3` gained a `tsconfig.json`
    reference to `../aws` for its e2e.
  - `apps/__e2e__`, e2e alone, aliases its own support `#testing/*`, no unit in its name and no
    ban needed.
  - Biome takes the last matching override, so the kernel's and the packages' `__tests__/**`
    overrides exclude `__tests__/testing/e2e/**`; a kernel part's e2e override (and the aws
    part's own) takes it back, keeping `inject` and the kernel entries; in `packages/`,
    `packages/**` covers it. Before the change a `#testing/data/e2e/…` import in a kernel unit
    test passed; 16 throwaway imports then failed with the record named.
  - A gap left to S30: an e2e suite in `packages/` may reach another package's support by alias
    (`#testing/db/e2e/…` from `packages/s3/__e2e__`); no code does; S30's Verify probes it.
  - The rejected `/testing-e2e` is described without its literal name in `decisions.md`, so
    Verify's grep stays empty; D19's note keeps the name.
  - Size: 62 files, about +240 / −209.

#### S29 — The application one workspace, one entry per module

- **Delivers:** `application/` becomes one workspace, `@app-template/application` (the root
  `workspaces` lists `application` for `application/*` and `application/*/contract`), with an
  export per module (`./chat`, `./identity`, `./use-cases`) and their `/testing`; the identity
  contract stays a folder, `application/identity/contract/`, exported through
  `@app-template/application/identity`; the guards follow the kernel's pattern, a Biome override
  per unit refusing the units it may not import by their entry, with no list of names, so what
  chat takes from identity's entry (today `UserId` alone) is held by `.claude/rules/modules.md`; `application/{chat,identity,use-cases}/index.ts` each the one entry (re-exporting
  `domain/`, `services/`, `infrastructure/`; the use cases' `chat/`); the internal aliases name
  the module (`#chat/domain/*`, `#identity/services/*`, `#identity/contract/*`,
  `#use-cases/*`, `#testing/chat/*`), and each layer override matches them by glob
  (`#*/services/**`); a module reaches the use cases or another module only through its entry,
  never `#<other module>/…`. Each service key takes its file's folder from the repository root
  (`@app-template/application/chat/services/ChatService`), the rule S27 set. Every import of these units is rewritten (about 100 in 50 files). Each
  Biome ban on another unit's layer (`@app-template/*/services`, `*/infrastructure`, `*/domain`)
  either matches the imported name through `importNamePattern` (the mappers, `*FromConfig`,
  `*Service`, `*Repository`) or is recorded as lost; the use cases' ban on a module's
  infrastructure goes (R15). `application/` becomes one `tsconfig.json` project, as `kernel/`
  is, on the user's word: the modules' projects and the identity contract's go (the contract's
  existed only so `tsc -b` would not compile it twice), and the Biome overrides this step adds
  hold the boundaries between modules that their `references` held.
- **Goal:** R21, R7 and R15 as amended; D21, D4's and D3's notes.
- **Blocked by:** S28.
- **Files:** `package.json` (root `workspaces`), `application/package.json` (new) and the
  modules' manifests (gone), `bun.lock`, `application/tsconfig.json` (new) and the modules' and
  the contract's `tsconfig.json` (gone), the root `tsconfig.json` and every `references` naming
  them, `biome.json`,
  `application/{chat,identity,use-cases}/index.ts`, every `*.ts` under `application/` (aliases)
  and every one importing `@app-template/{chat,identity,identity-contract,use-cases}`, every
  `package.json` declaring them, `Makefile` (`bundle-check`'s pattern, which names the keys),
  `docs/knowledge/decisions.md › A module's layers`, `› Module
  contracts`, `› Use cases above the modules`, `docs/knowledge/architecture.md`,
  `.claude/rules/{modules,naming}.md`, and every doc `git grep` finds naming an old specifier or
  alias.
- **Test first:** `config only` — every case and assertion kept (D14).
- **Verify:** `make check`; `git grep -nE "'@app-template/(chat|identity|identity-contract|use-cases)['/]|'#(domain|services|infrastructure|contract)/" -- ':!docs/tickets' ':!repos'`
  finds nothing; throwaway imports of a mapper into an api handler, of `#chat/infrastructure/…`
  into chat's services, of `@app-template/application/chat` into identity and of
  `@app-template/kernel/postgres` into a use case each fail Biome naming the record; one of
  `AssistantLlmFromConfig` into a use case passes; `make bundle-check` still fails on
  `ChatService` in the web app; `find application -name tsconfig.json -not -path '*/node_modules/*'` finds
  `application/tsconfig.json` alone.
- **Model:** `opus high`
- **Status:** done
- **Findings:**
  - Biome replaces the options of two overrides matching one file, so each module's layer is an
    override of its own (`application/<module>/<layer>/**`), not one per layer as D4's note had
    it; the layer patterns still match by glob. A layer with no override passes every ban but
    the relative path ("Add a module" names it).
  - Which names a module takes from another's entry is review's (`modules.md`), on the user's
    word: a suffix ban, then an inverted `importNamePattern` of the contract's forms
    (`<Name>Id`, `<Name>Error`, `Current<Name>`) were tried and removed (S29.1); `http-api`,
    which reads identity's `User`, keeps its suffix ban, which a namespace import passes.
  - Review found a module's source free to import its own test support (`#testing/<module>/…`),
    a gap older than the step; each source layer's override now refuses `#testing/**`.
  - `make bundle-check`'s pattern took the new keys (`Makefile`, added to Files); the bundle is
    unchanged but `bun build` parses 1266 modules (324 before) and warns about `node:net`, the
    cost D21 names. `"sideEffects": false` now covers the use cases.
  - Stale `node_modules` of the old module workspaces were removed by hand before the last run.
  - Size: 109 files, about +904 / −752 without `bun.lock`, past the ~400 limit; one commit on
    the user's word, as S27.

#### S30 — A Biome list per workspace

- **Delivers:** each workspace's Biome override, and each unit's inside `packages/`,
  `application/` and `kernel/`, refuses `@app-template/**` but for the units it may import
  (`!@app-template/<folder>`, `!…/testing` in its tests), following the rings, the message
  naming D22's record. `packages/` becomes one `tsconfig.json` project, as `kernel/` is, in
  this same step, so the check between packages moves from their `references` to the lists
  with no commit leaving it to neither.
- **Goal:** R12 and R13 as amended; D22, D12's note.
- **Blocked by:** S29.
- **Files:** `biome.json`, `packages/tsconfig.json` (new) and `packages/*/tsconfig.json`
  (gone), the root `tsconfig.json` and every `references` naming a package,
  `docs/knowledge/decisions.md › Guards are configuration`,
  `docs/knowledge/{architecture,tooling}.md`, `.claude/rules/modules.md`.
- **Test first:** `config only` — every case and assertion kept (D14).
- **Verify:** `make check`; a throwaway import of `@app-template/packages/db` into `apps/web/` and one of
  `@app-template/application/chat` into identity's services each fail Biome naming the record
  (R12), and so does one of `@app-template/packages/s3` into `packages/db` and one of
  `#testing/db/e2e/…` into `packages/s3/__e2e__` (another unit's file, which no S28 ban
  refuses inside `packages/`); a script lists every
  `@app-template/<folder>` import with its workspace and finds each in that workspace's list;
  `find packages -name tsconfig.json -not -path '*/node_modules/*'` finds
  `packages/tsconfig.json` alone.
- **Model:** `opus high`
- **Status:** done
- **Findings:**
  - The Verify probe of `@app-template/application/identity` into chat's services could not
    fail (chat sits above identity and imports it); the reverse probe replaced it. The
    `git ls-files 'packages/**/tsconfig.json'` check matched nothing in any tree state (git's
    `**/` needs a folder between); `find` replaced it here and in S29.
  - Biome's `noImportCycles`, already on, refuses a cycle between units of one folder through
    value imports (probed: `kernel/aws` into `kernel/config`); only a cycle through
    `import type` is review's. D22's Cost, its Risk, `decisions.md` and `modules.md` say so.
  - Review found two units with no list: the modules' entries (`application/<module>/index.ts`,
    through which a cycle between modules passed) and `packages/aws/__tests__/**` (free to reach
    another package's `#<package>/…`, which its own project had refused). Each has an override.
  - A kernel part's or a package's one override covers its source and its e2e, so the source
    may import the test support its list admits, as before the step; D22's Cost records it.
  - Size: 22 files, about +695 / −419, past the ~400 limit; one commit on the user's word, as
    S27 and S29, since a split would leave one commit checking the packages by neither their
    `references` nor their lists.


#### S31 — The mappers' e2e beside the mappers; the use cases' e2e through the api

- **Delivers:** `apps/__e2e__/mappers/{chat,attachment}.mapper.e2e.ts` →
  `application/chat/__e2e__/services/`, `user.mapper.e2e.ts` →
  `application/identity/__e2e__/services/`, over the data layer's `DbTest`, each inserting the
  owner's row in its arrange step; `DbWithUsersTest` (`apps/__e2e__/testing/db.test-layer.ts`) goes,
  on the user's word, with no support of its own in `application`. The use cases' e2e
  (`apps/__e2e__/use-cases/*`: two concurrent sends to one chat, one file bound to two chats at
  once, a refused title job, a refused chat delete) become requests to the api over `StandTest`, in
  `apps/__e2e__/chat.e2e.ts` beside the journey, whose helpers they share: each case and assertion
  kept (D14), the outcome read on the wire (the status, the error's tag) and the rows, the jobs and
  the bytes read behind the apps as today; the database's refusal still added by the test (a table
  or a constraint). `ChatPgTest` and `apps/__e2e__/use-cases/` go.
- **Goal:** R11 and R10 as amended; D19's note (S31).
- **Blocked by:** S30.
- **Files:** the moved and rewritten suites; `apps/__e2e__/testing/{db,chat}.test-layer.ts`
  (gone), `biome.json` (an override for each module's `__e2e__/**`, admitting
  `@app-template/kernel/data/testing/e2e`),
  `docs/knowledge/decisions.md › Tests in their folders`, `docs/knowledge/architecture.md ›
  Where tests live`, `docs/knowledge/tooling.md`, `.claude/rules/effect-tests.md` (a use case's
  transaction or race through the api), `apps/CLAUDE.md` and `application/CLAUDE.md` where they
  name the e2e.
- **Test first:** `config only` for the moves; the rewritten cases keep every assertion, and a
  probe that drops the guard (the database's refusal, the chat's busy status) turns each red.
- **Verify:** `make check`; `make test-e2e` green, with the same count of cases as before;
  `git ls-files 'application/**/__e2e__/**'` lists the three mapper suites alone;
  `grep -rn 'SendMessageUseCase\|ChatService' apps/__e2e__` finds none; a throwaway import of
  `@app-template/kernel/data/testing/e2e` into `application/chat/__tests__/` fails Biome.
- **Model:** `opus high`
- **Status:** done
- **Findings:**
  - The four cases sit in `chat.e2e.ts` beside the journey, sharing its helpers (files 22 → 20,
    cases 110 → 110). The two races share the journey's stand; the refused title job and the
    refused delete alter the schema, so each builds a stand of its own, with a 30 s timeout.
  - Review found the first round's stores in `StandTest` serving the test only because the memo
    map built the apps first; moved beside `FileRepository`, they would have bound the apps to
    the test's `Db` and the rollback cases would still pass. `StandTest` is unchanged: the cases
    compare the api's answers, and raw rows through the stand's `SqlClient` where the api has no
    read (a chat's messages, the jobs), before and after the refused write.
  - A defect reaches the client as a `DecodeError` at `500`, since the contract declares no
    error for it; a race counts as refused only a `ChatBusyError` or that `500`.
  - The race's probe must drop all four guards (the status check in `queueChat`, `status` in the
    status move's `where`, `onConflictDoNothing` and the partial unique index): dropping the
    index alone makes the insert's `ON CONFLICT` invalid and refuses both sends, red for the
    wrong reason. With all four gone both are stored.
  - The race keeps a live worker on the user's word: both sends are stored only if the loser
    reads the chat after the winner's reply has set it idle, an outbox tick and several round
    trips after a request sent alongside; a stand without a worker would close it at the cost of
    new support.


#### S32 — Test support beside its one user

- **Delivers:** support that one unit alone uses moves to it, on the user's word after an audit
  of every `*.test-*.ts` export's users. `kernel/data/__tests__/testing/e2e/job.test-fixture.ts`
  (`SampleJob`, `sampleJobQueue`, `sampleProvenance`), which only `kernel/queue/__e2e__` reads,
  → `kernel/queue/__tests__/testing/e2e/`, aliased `#testing/queue/e2e/*` with no export, since
  no other unit imports it; the data's `testing/e2e/index.ts` drops it. The fixtures of
  `application/chat/__tests__/testing/` that one suite alone reads (`unknownAttachmentId`,
  `unknownMessageId` in chat's service tests, `ask` in a use case's test) move into that suite.
- **Goal:** R11; D19's note (S28: a unit's support lives with that unit).
- **Blocked by:** S30. Runs beside S31, in a worktree: S31 touches neither file.
- **Files:** the fixture files and their readers, `kernel/package.json`, `biome.json` if the
  queue's support needs the kernel's e2e override, `docs/knowledge/` wherever it names the moved
  file.
- **Test first:** `config only` — every case and assertion kept (D14).
- **Verify:** `make check`; `make test-e2e` green with the same count of cases;
  `grep -rn 'sampleJobQueue\|SampleJob' kernel/data` finds none; each moved fixture has one
  reader.
- **Model:** `opus medium`
- **Status:** done
- **Findings:**
  - Ran in worktree N=1 beside S31 on the user's word; picked onto the branch after S31 with no
    conflict (`biome.json` merged clean).
  - `kernel/queue`'s Biome override now covers `kernel/queue/__tests__/testing/e2e/**`, as
    `kernel/aws`'s covers its own, so the fixture may read the inventory.
  - Review found `decisions.md` and `architecture.md` saying every part's e2e support has an
    entry and an export; both now say support one unit alone reads keeps the alias and no entry.


#### S33 — The test layout told in one place

- **Delivers:** on the user's word after S31, where tests and their support live (the folders,
  `testing/` and `testing/e2e/`, the entries and aliases, which support a test may import, what
  `apps/__e2e__` checks) is told in `docs/knowledge/decisions.md › Tests in their folders` (why)
  and `docs/knowledge/tooling.md › Tests` (how) alone. `docs/knowledge/architecture.md › Where
  tests live`, `database.md`, `aws.md`, `.claude/rules/effect-tests.md`, `README.md` and the
  `CLAUDE.md` files keep at most one sentence naming the place, with a link; every fact they
  repeat goes. Each moved test or renamed folder after this step edits those two docs alone.
- **Goal:** R19 (the docs describe the rings and how to extend them), each fact told once.
- **Blocked by:** S32.
- **Files:** the docs named above, `.claude/rules/naming.md`, `glossary.md › Memory layer`, and
  the recipes and rows of `architecture.md` that name a test path; a `CLAUDE.md` keeps what
  `.claude/rules/claude-md.md` asks of it and links the rest.
- **Test first:** `docs only`; a fact cut from a doc is found in one of the two, quoted in the
  report.
- **Verify:** `make check`, `make doc-width`, `make doc-names`, `lychee` on the touched docs;
  `git grep -n '__tests__/testing/e2e' -- ':!docs/tickets'` finds it in the two docs, Biome and
  the code alone.
- **Model:** `opus medium`
- **Status:** done
- **Findings:**
  - `decisions.md` already held every fact of the layout and is unchanged; `tooling.md › Tests`
    gained the folder, support and import rules, the suite-by-ring table (from `architecture.md`)
    and the data layer's suites.
  - Beyond Files: `naming.md` (it named `__tests__/testing/e2e/`), the glossary's Memory layer
    (paths) and `architecture.md`'s recipes, Dependency rules and Imports, so moving a test no
    longer edits a recipe.
  - `apps/__e2e__` stays named in `architecture.md › Dependency rules` and the root `CLAUDE.md` as
    a workspace, not a test path; S35 edits them.
  - `lychee` is not installed locally: run through Docker with CI's flags and
    `--include-fragments`, 0 errors.
  - Review: the apps row said both apps' unit tests run the app's layer; the worker's call a
    handler over its use case's test layer, and the row says so. The mapper recipe keeps the
    Postgres round trip until S34.
  - Left for the md-files follow-up: `decisions.md › Tests in their folders` still restates what
    `tooling.md › Tests` tells; `effect-tests.md` is 82 lines against the ~80 budget.


#### S34 — The mappers checked by unit tests over the schemas

- **Delivers:** on the user's word after S32, `application` keeps unit tests alone. The three
  mapper e2e (`application/chat/__e2e__/services/{chat,attachment}.mapper.e2e.ts`,
  `application/identity/__e2e__/services/user.mapper.e2e.ts`) become unit tests
  `application/<module>/__tests__/services/<name>.mapper.test.ts`: each model's extreme value and
  every value of its statuses and authors is encoded through its mapper, decoded by the entity's
  insert schema (the enums' values come from the table), and read back through the mapper equal
  to the model; one case per module compares each limit and pattern the model and the table
  both declare (`maxTitleLength`, `mediaTypePattern`, `secretHashPattern`), which `kernel/data`
  now exports. The data layer's entity e2e bind the table's rule to its SQL check: each refuses
  the limit plus one by the exported constant (not a literal `121`) and accepts the limit itself.
  The `application/<module>/__e2e__/` folders and their Biome overrides go.
- **Goal:** R11 as amended (no e2e from `application`); D11's guard rewritten.
- **Blocked by:** S33.
- **Files:** the three suites (moved and rewritten), `kernel/data/{chat,attachment,user}/*.table.ts`
  and the data's entry (the constants), `kernel/data/__e2e__/{chat,attachment,user}/`,
  `biome.json`, `feature.md` (R11 and its row), `docs/knowledge/decisions.md › Checks kept in the
  tables` (Guarded by) and the two docs S33 leaves holding the test layout.
- **Test first:** each new unit case is red when the model's limit, pattern or a status literal is
  changed on one side (a probe per kind); each data e2e case is red when the check's SQL limit is
  changed.
- **Verify:** `make check`; `git ls-files 'application/**/__e2e__/**'` finds none; the unit run
  counts the mapper cases the e2e had; the e2e run counts three files fewer.
- **Model:** `opus high`
- **Status:** done
- **Findings:**
  - Ran in worktree N=1 beside S35 on the user's word; rebased onto S35, keeping its deletion of
    the two `application/<module>/__e2e__/**` overrides and both steps' wording of
    `decisions.md › Tests in their folders`. Unit 199 → 213 cases; e2e 110 → 102, three files
    fewer; every one of the mapper e2e's 11 cases has its unit twin.
  - One constants case per mapper, not per module, so a pattern's drift fails beside the mapper
    that writes it. The table's `mediaTypePattern` carries the `i` flag its `~*` applies, so both
    patterns compare whole; the migration is unchanged (`make migration-check`).
  - The credential is not round-tripped: its encoder is its own schema both ways; `tsc` holds its
    kind to the table, and the data e2e accepts a hash of every hex digit.
  - Review, on the user's word: the case per status and author stays (`tsc` refuses a drifted
    status only where a use case writes it), and so do the exported constants and their
    comparison (the entity's insert schema checking them was rejected, see D19's note).
  - An `i` flag added to both hash patterns already fails `SecretHash › rejects upper-case hex`
    (probed); `decisions.md` and `tooling.md` say only the title limit is bound by its constant.


#### S35 — `apps/__e2e__` → `apps/e2e`, a test app

- **Delivers:** on the user's word after S32, the workspace that checks the whole system over real
  connections is a test app, `apps/e2e` (`@app-template/e2e`), not a `__e2e__` folder, which
  everywhere else means the e2e of its own folder's source. Today's suites move to
  `apps/e2e/api/`, its support to `apps/e2e/testing/` (still `#testing/*`), so a later UI suite
  (Playwright) takes `apps/e2e/web/`. It runs no process and is still the one workspace that
  imports the apps' `testing` exports.
- **Goal:** R11 as amended (the flow's e2e in `apps/e2e`).
- **Blocked by:** S33. Runs beside S34 on the user's word, in a worktree: S34 touches neither
  `apps/` nor the e2e project.
- **Files:** the moved folder, `vitest.config.ts` (the e2e project includes
  `apps/e2e/**/*.e2e.ts`, or `make test-e2e` skips the journey), `tsconfig.json`, `biome.json`,
  `bun.lock`, `apps/CLAUDE.md` (a test app, not a fourth process), the root `CLAUDE.md` map,
  `architecture.md › Dependency rules`, `.claude/rules/effect-tests.md`'s `paths:` (its
  `**/__e2e__/**` glob no longer matches the journey), `feature.md` (R11 and its row), and the
  two docs S33 leaves holding the test layout.
- **Test first:** `config only` — every case kept; the e2e run counts the same cases.
- **Verify:** `make check`; `make test-e2e` counts as many cases as before;
  `git grep -n 'apps/__e2e__' -- ':!docs/tickets'` finds none; `make dev` starts api, worker and
  web alone.
- **Model:** `opus medium`
- **Status:** done
- **Findings:**
  - Ran in worktree N=2 beside S34 on the user's word; landed first, so the two Biome messages of
    the `application/<module>/__e2e__/**` overrides, which S34 deletes, name `apps/e2e` meanwhile.
  - Beyond Files: the `Makefile`'s help for `make test-e2e` and `naming.md`'s `.e2e` row named the
    e2e place.
  - R11's row refused any `e2e/` folder outside `__tests__/` and `__e2e__/`, the test app itself;
    R11 and its row now admit `apps/e2e` and its `testing/`.
  - Review: `decisions.md`, `tooling.md` and `architecture.md` said every e2e lives in `__e2e__/`;
    each names the test app as the exception. `apps/CLAUDE.md` names no future `web/` suite and
    links the import rule instead of restating it.


#### S36 — The branch review's test fixes

- **Delivers:** on the user's word after the branch review of 2026-11-02:
  - the reply's rollback through the api: a case in the journey's e2e adds a check the chat's
    move to `idle` breaks, sends a message, and the assistant message ends `failed` (through the
    last attempt's failure), never `done` with the chat still `queued`, so the worker's transaction is
    proven bound to its writes as the api's is;
  - `job.relay.e2e.ts`'s failing-batch case asserts the first log entry alone, since the relay's
    retry after 300 ms may log a second;
  - the shared stand of the journey's e2e builds with `timeout: '60 seconds'`, as the
    `AwsTest` suites do;
  - the model tests' `it.each` over primitives become `it.effect.each` over objects
    (`effect-tests.md › Writing a test`);
  - `sortById` leaves `packages/testing` for its one reader, which sorts or compares id sets in
    place; `rows.test-util.ts` moves to the data layer's memory repositories, its one reader,
    or `decisions.md` records why it stays; `resources.test.ts` moves to `__tests__/domain/`,
    the folder of what it checks;
  - one `ApiClient` layer with a cookie jar: the api's test layer takes a base URL and the stand
    provides `FetchHttpClient` to it, so the stand's copy goes;
  - the apps' `./testing` export their layers under their own names (`ApiLayer`, `WorkerLayer`):
    a `Test` suffix names a test double alone; the export stays `./testing` (S26).
- **Goal:** R11 (`packages/testing` only shared support); the rollback case proves for the
  worker's reply what R10's case proves for the api's send, that its writes commit together.
- **Blocked by:** S34, S35.
- **Files:** the suites and support named above, `apps/{api,worker}/__tests__/testing/`,
  `apps/e2e/testing/stand.test-layer.ts`, `docs/knowledge/tooling.md › Tests` where it names a
  moved file or the layers' names.
- **Test first:** the rollback case is red when the worker's use case runs outside its
  transaction (a probe dropping `transaction.run`); every other case kept.
- **Verify:** `make check`; `make test-e2e` counts one case more; `git grep -n 'sortById\|LayerTest\b'`
  finds none outside the ticket.
- **Model:** `opus high`
- **Status:** done
- **Findings:**
  - Ran in worktree N=1 beside S37 on the user's word. Unit 213 cases, e2e 103.
  - The rollback adds `CHECK (status <> 'idle') NOT VALID` on the chats, so the chat, created
    idle, stands and only the settle's move to idle is refused; red with `transaction.run` dropped
    from the settle (`expected 'done' to equal 'failed'`). The last attempt fails the reply, the
    dead letter then finds it settled.
  - `rows.test-util.ts` moved to the data layer's memory repositories and reuses the database
    package's `orDieOnNoRows` instead of its copy; `packages/db/testing` keeps `TransactionTest`.
  - The Verify grep also finds `ClusterLayerTest` in the vendored `repos/effect`: not ours.
  - Simplify: one sort of the expected messages, since the memory repository orders by creation
    and then by id, as the database does; `layerApiClient(baseUrl, cookies)` positional, as
    `effect-style.md` keeps two parameters.
  - Review: the cookie jar had one reader after the merge and moved into `layerApiClient`; the
    relay's case asserts every logged entry is the failure, however many polls ran; the rollback
    case has 60 s, as it builds its own stand and waits out three attempts; `decisions.md` and the
    ticket's D19 name where a unit's own support lives.


#### S37 — The docs the branch review found out of step with the code

- **Delivers:** on the user's word after the branch review of 2026-11-02:
  - `decisions.md`'s use-case snippet calls no method the code lacks: a neutral example, or the
    real calls;
  - `architecture.md`'s bundle check names what the `Makefile` greps (the ports it lists), or the
    grep matches every port of a `domain/`;
  - `architecture.md › Known gaps` adds a browser-safe package importing a server library: one
    `packages/package.json` declares them all, and neither Biome nor the bundle check refuses it;
  - `feature.md`'s acceptance rows of R8 (the contract folder; no `__e2e__` after S34) and R9
    (the data layer's source, its e2e importing the inventory and config) match the code;
  - `roadmap.md:123` names no path that no longer exists; the ticket's `architecture.md`
    Overview and Contracts drop `identity-contract` and `./testing-e2e`.
- **Goal:** R19 (the docs name nothing that no longer exists).
- **Blocked by:** S35.
- **Files:** `docs/knowledge/{decisions,architecture,roadmap}.md`, `feature.md`, the ticket's
  `architecture.md`, the `Makefile` only if the grep widens.
- **Test first:** `docs only`; a widened grep is proven red by a probe port named otherwise.
- **Verify:** `make check`, `make doc-width`, `make doc-names`.
- **Model:** `opus medium`
- **Status:** done
- **Findings:**
  - Ran in worktree N=2 beside S36 on the user's word.
  - The grep widened: it matches every key under a module's `domain/`, since only a port carries
    one there; a probe port `Clock` passed the old grep and failed the new.
  - Beyond the listed spots, R19 asked for every stale name outside the Note paragraphs: R6's
    row and the Scope (`apps/e2e`), the use-case example in the ticket's Contracts and in
    `architecture.md`, the ticket's Structure, Seams, Contracts paragraph and Biome rows, the D3,
    D4 and D19 headlines and the nested-contract risk. A decision's headline states what binds
    now; its Notes keep the history.
  - Review: the kernel exports `/aws` and `/data` whole, so the diagram, the matrix, the D5
    headline and `decisions.md` name what Biome allows by name instead of the gone subpaths
    `/aws/resources` and `/data/file`; the `package.json` blocks are marked excerpts; Known gaps
    uses a placeholder for the server library.


#### S38 — The chat module in one shape

- **Delivers:** on the user's word after the branch review of 2026-11-02 (Standards and Depth),
  the chat module reads as one shape; every item below is the user's word of 2026-11-02, and the
  step splits by the ~400-line budget:
  - one read verb per service, over a `where`: a domain service's read is `getOne`, as the
    repositories' `selectOne`, so `AttachmentService.get` becomes `getOne` and `naming.md`'s `get`
    becomes `getOne`; `AttachmentService.getOne`, `download` and `delete` take `{ id, userId }`
    instead of positional ids (`deep-modules.md`: a caller reads every store alike);
  - an aggregate's `Where` types in one file: `ChatWhere` leaves the mapper for the service,
    beside `ChatRenameWhere` and `ChatDeleteWhere`; the mapper keeps only `encodeChatWhere`;
  - the rename a model function (`renameChat`), as every other status or field move is; and every
    other rule a service or use case writes inline that reads only values (a decision over a
    model's fields, a mapping of a failure to a reason) becomes a pure function of its model when
    it has a name of its own and a caller or test that reads better for it; a branch that only
    sequences steps stays where it is;
  - the send checks the attachments before its first write: their bind's checks run before the
    user's message is inserted (`layering.md`: all checks precede every write);
  - the doubling delay and the dead-letter definition move from chat's queue file to
    `packages/queue`, which names no chat word, so the services' Biome lists drop
    `packages/aws`;
  - one copy each of the SHA-256 hex digest (the user's secret, the reply's instructions), the
    two message builders and the branded id schema;
  - answers only callers read: the download answers the URL; the instructions hash stays
    file-local; the adapter keeps one exported name.
- **Goal:** R8 (a module's layers hold what their names say); D8's mapper and the repository
  shape of `deep-modules.md`.
- **Blocked by:** S39.
- **Files:** `application/chat/{domain,services,infrastructure}/`, `application/identity/services/`,
  `application/use-cases/chat/`, `apps/api/` handlers that call the renamed methods,
  `packages/queue`, `biome.json`, `.claude/rules/naming.md` (`getOne`), their unit tests.
- **Test first:** every case kept, renamed with its method; the send's case that binds a foreign
  attachment asserts no message row was inserted before the refusal.
- **Verify:** `make check`; `make test-e2e` with the same count; `git grep -nw 'get'` finds no
  domain service's read, and no attachment read takes positional ids.
- **Model:** `opus high`
- **Status:** done
- **Findings:**
  - Two rounds: S38.1 read attachments by `where` and checked them first; S38.2 finished the
    shape. Unit 221 cases, e2e 104.
  - The bind, option B on the user's word: the send reads with `AttachmentService.getMany`, binds
    with the pure `bindAttachment` before its first write, and writes the bind through the
    repositories after the message's insert (its key to the message is not deferrable), the files
    first. `AttachmentService.bind`, which answered an `Effect` of an `Effect`, is gone.
  - No read takes a lock, on the user's word: the loser of two sends answers `409` when it reads
    after the winner, else dies with a `500` on the write's `messageId: null` guard. This departs
    from postgres-drizzle's R10 and reverses S38.1's "two sends of one file answer 409"; recorded
    in `decisions.md › Guards in the write, no lock` and D7's Note.
  - Review found a partial race: a send of `[a, b]` against one of `[a]` bound only `b` and
    committed, its message claiming `a`. A repository write over a list of ids now dies unless it
    changes a row per distinct id (`orDieOnMissedRows`); an e2e race on overlapping sets and a
    repository case hold it, both red with the old `orDieOnNoRows`.
  - A business rule is a pure function in its model, built from small pieces (`isLiveAt`,
    `ensureAllLive`, `ensureUnbound`, `bindAttachment`); `layering.md` states it with a do/don't
    fence, `decisions.md › Rules as pure functions` records it. `isFirstMessage` stays in the
    send: a model function would only rename `Option.isNone`.
  - One `AttachmentNotFoundError` names every missing id once, in the order asked; reads answer
    creation order (`createdAt`, then `id`), as the messages do.
  - Dropped on the user's word: the one SHA-256 digest (the user's secret and the instructions keep
    their own) and the file-local instructions hash (its test reads it); `UserId` keeps its own
    schema, `buildIdSchema` serves the chat module's ids.
  - Drizzle's `inArray` renders `[]` as `1 = 0`; `getMany` still returns early on no ids, so a
    send without files reads nothing. The bind writes the ids it read, each once.
  - Known, left open: a send that rolls back after untagging its files leaves their bytes tagged
    bound, so an expired attachment's bytes stay; the old lock made this rarer, not impossible.
  - Added on the user's word: a builder spreads one `Types.Simplify<Pick<…>>` of the fields it
    copies (`effect-style.md`), and every type built from others is wrapped in `Types.Simplify`
    (`effect.md`).
  - Over budget, left to `lean-instructions`: `layering.md` at 92 lines, `effect-style.md` at 84.


#### S39 — `biome.json` keeps only the import rules nothing else holds

- **Delivers:** on the user's word of 2026-11-02 (design A of the branch review's Biome research),
  `biome.json` shrinks from about 2000 lines to about 150–250: one override per layer, not per
  module, and only the rules no other mechanism holds, by harm:
  - the browser: what `http-api`, the web client, a module's `domain/` and a contract may import,
    by unit and by name (`*Service`, `*FromEntity`, `encode*`/`decode*`), since `bundle-check`
    sees only a service's key;
  - `noImportCycles`;
  - the data layer imports no other part of the kernel;
  - a module reaches only its own files: one GritQL plugin (about 15 lines) reads the module from
    the file's path and refuses `#<other>/…` and `#testing/<other>/…` in all six import forms,
    so no list repeats per module;
  - a module's layers point inward (`application/*/<layer>/**` globs), and no relative import
    (`./`, `../`) bypasses the aliases.

  Dropped, each to the mechanism that holds it: an import across workspaces (the isolated linker
  and `tsc -b`, TS2307, with no record's name in the message); a repository or a mapper in a
  handler, and test support in source (review, by `layering.md` and `effect-tests.md`); e2e
  support in a unit test (`make test-unit` needs no Docker, so it fails). `decisions.md › Guards
  are configuration` and every record's Guarded by say which mechanism now holds each boundary;
  `feature.md`'s acceptance rows of R12, R13, R15 and R17 follow, on the same word.
- **Goal:** R12–R17 as amended; `biome.json` small enough to read whole.
- **Blocked by:** S36. S38 follows it, since S38 edits the services' Biome lists.
- **Files:** `biome.json`, a plugin file beside it, `docs/knowledge/decisions.md`,
  `architecture.md › Dependency rules` and Known gaps, `.claude/rules/modules.md`, `feature.md`
  (R12–R17 rows), `tooling.md` where it names the lists.
- **Test first:** a probe per kept rule turns `make check` red (a server import in the web
  client, a `#identity/…` file from chat in each import form, a `../` import, `kernel/data`
  importing another part); a probe per dropped rule names the mechanism that refuses it, or
  review.
- **Verify:** `make check`; `wc -l biome.json` under 300; the probes listed in the report.
- **Model:** `opus high`
- **Status:** done
- **Findings:**
  - `biome.json` 1931 → 297 lines; the plugin `biome-imports.grit` 25. Every kept rule probed red
    (39 refusals, 11 import forms of another module's file); every dropped one names its holder:
    TS2307 (5 probes), `noImportCycles` (4), `make test-unit` (a unit test building `DbTest`), or
    review (`modules.md`, a list of what passes `make check`).
  - The plugin also holds kernel parts and packages and the relative-path ban, so no override
    repeats it; it reads the unit from the absolute path, as Grit gives no other.
  - The entry of `application/` keeps an override (imports no workspace); `apps/web/main.ts`, the
    web server entry, went to review.
  - R12, R15 and R17 changed what they ask: an undeclared workspace fails with TS2307, naming no
    record; R17 splits between `make test-unit` and review. `feature.md` and its rows follow.
  - Review: `packages/s3` passed unseen, the unit pattern lacked digits (the bundle check's grep
    too); the matrix claimed TS2307 for a kernel part importing another and for the web server
    entry, which pass `tsc`; `modules.md` back to 80 lines, its sample snippet dropped, its
    `Record:` links kept; `decisions.md` owns the design, the other docs link it.


#### S40 — R1 names the three answers S38 changed

- **Delivers:** on the user's word after verification run 2, R1 keeps "the same status, body and
  errors as before" but for three answers S38.2 changed on purpose: `AttachmentNotFoundError`
  names `ids`, every absent id once in the order asked; the loser of two sends of one file answers
  `409`, or `500` when it read before the winner wrote (no row lock); a send answers its
  attachments in creation order. R1's acceptance row names them, and `decisions.md` records the
  creation order beside `Guards in the write, no lock`.
- **Goal:** R1 states what the branch answers; verification run 3 can pass it.
- **Blocked by:** none.
- **Files:** `feature.md` (R1 and its row), `docs/knowledge/decisions.md`, the glossary if it names
  the order.
- **Test first:** none, a docs step; the suites already hold the three answers.
- **Verify:** `make check`; `make doc-width doc-names`.
- **Model:** `opus medium`
- **Status:** done
- **Findings:**
  - Ran in the main tree beside S41 (N=1) and S42 (N=2) on the user's word; its edits keep to R1,
    its row and the new record `decisions.md › Reads in creation order`. The glossary names no
    order and is unchanged.
  - The order is a record of its own, a read's contract, not a field of `Guards in the write, no
    lock`. Review: the chat list answers newest first, so the record covers a chat's contents
    only; the acceptance row points at R1's three answers instead of restating them, and covers
    both races `sendRacing` drives; the `500` falls to a loser that read before the winner
    committed, here and in the guards' record.

#### S41 — `packages/` reaches no app ring; the HTTP contract held by a snapshot

- **Delivers:** R13's gap closed: the GritQL plugin `biome-imports.grit` refuses, from any file
  under `packages/`, an import of any workspace but `@app-template/packages`, in every import form
  it reads, naming `decisions.md`'s record of the packages, so a dependency declared in the manifest no
  longer passes. Lesson L5: `make api-check`, in `make check`, generates the OpenAPI document of
  `Api` and diffs it against a committed snapshot; a contract change fails until the snapshot
  moves with it, and `make api-snapshot` rewrites it.
- **Goal:** R13 whole; a contract change seen by `make check` (R1).
- **Blocked by:** none; runs beside S40 and S42 on the user's word.
- **Files:** `biome-imports.grit`, `biome.json`, `Makefile`, `.github/workflows/ci.yml`, the
  snapshot `http-api/openapi.json` and its generator `apps/api/openapi.ts`, `http-api/CLAUDE.md`, `docs/knowledge/decisions.md` (Guarded by), `architecture.md › Known gaps`,
  `tooling.md` (the new target), `feature.md` R13's row if it names the check.
- **Test first:** the probe of verification run 2 (`"@app-template/kernel"` in
  `packages/package.json`, an import of `@app-template/kernel/config` in `packages/db`) turns
  `make check` red naming the record; a field renamed in an error schema turns `make api-check`
  red.
- **Verify:** `make check`; both probes red, then removed; `make api-check` green on HEAD.
- **Model:** `opus high`
- **Status:** done
- **Findings:**
  - Ran in worktree N=1 beside S40 (main tree) and S42 (N=2) on the user's word; picked last,
    the docs merged clean.
  - Run 2's probe red before the change and after it: the plugin names `decisions.md › One kernel`
    for every workspace, `deployment` too, as the record says the packages' manifest declares
    none. A field renamed in an error schema turns `make api-check` red with the diff.
  - Review (round 2): every rule of the plugin now reads a template literal, a type's `import()`,
    `require.resolve`, `import.meta.resolve` and vitest's mock and `importActual` loaders; a
    specifier built at runtime is a fifth known gap. The generator moved from `http-api`, which
    ships to the browser, to `apps/api`, and writes the file it is given, so a log never lands in
    the document; `make api-snapshot` replaces the snapshot only after a generation succeeds; a
    missing snapshot says so. CI runs the check on the pinned Bun alone.
  - The snapshot stays out of Biome, as the migrations do: Biome would reformat it. A script and
    a `diff`, not a vitest file snapshot: the diff names the changed lines.
  - Left out: the type-import gap of the web client, which the plugin could now close (Known
    gaps); the false refusal under a `/packages/` folder above the checkout, a recorded cost.

#### S42 — The verification's small fixes in docs, tests and chat's code

- **Delivers:** run 2's simplifications 3–7:
  - `docs/knowledge/architecture.md`: the diagram label `/domain only` names what the entries
    give; the services' packages are `db` and `queue`, as `biome.json` holds (and the ticket's
    matrix row);
  - `application/chat/__tests__/domain/resources.test.ts` moves to the layer its import of
    `@app-template/kernel/aws` belongs to;
  - `settleWith` in the reply use case reads the chat without `Option.getOrThrow`, a defect
    through a pipeable;
  - the type cycle between `chat.mapper.ts` and `chat.service.ts` breaks (`encodeChatWhere` into
    its one caller, or the where type where both read it);
  - `getMany`'s where type named once beside `AttachmentWhere`; `identity` imported from
    `'effect'` in every repository; the attachment repository's nullable `messageId` read as the
    chat repository reads its `title`.
- **Goal:** the branch matches its rules and its docs before the PR.
- **Blocked by:** none; runs beside S40 and S41 on the user's word.
- **Files:** `docs/knowledge/architecture.md`, the ticket's `architecture.md` matrix, the moved
  test, `generate-assistant-message.use-case.ts`, `chat.mapper.ts`, `chat.service.ts`,
  `attachment.service.ts`, the three repositories in `kernel/data`.
- **Test first:** none new; every case kept, the moved suite green in its new place.
- **Verify:** `make check`; `git grep -n 'getOrThrow' -- application ':!**/__tests__/**'` empty.
- **Model:** `opus high`
- **Status:** done
- **Findings:**
  - Ran in worktree N=2 beside S40 (main tree) and S41 (N=1) on the user's word. Unit 221 cases,
    e2e 104, as before; the moved suite is a 100% rename.
  - The written Verify grep matched the tests' `getOrThrow` before and after the fix (lesson L4),
    so it leaves out `__tests__/`; on HEAD it found the one line in `settleWith`.
  - `encodeChatWhere` moved into its one caller, the service, not the where types to a third
    file (`deep-modules.md`); `database.md` now says the service maps a where's `Option`.
  - Review (round 2): the nullable where was a copy in two repositories, now `eqOrIsNull(column)`
    beside `buildWhere`, named for the SQL it renders; `jobs.sentAt` keeps `isNull`, its where
    admits `null` alone. `settleWith` dies on the missing chat alone (`flow(Effect.fromOption,
    Effect.orDie)`), so a typed error of the read reaches the signature. `AttachmentGetManyWhere`
    is built from the model and has its doc line. The ticket's matrix row admits `db` and `queue`.
  - Not taken: `getOne` over `getMany` (Depth, worth exploring): one `orDie` over a one-element
    list reads worse than the two calls of the liveness rule.
  - No `/simplify` pass: the step is itself the verification's simplifications.

## Requirement coverage

| Req | Steps |
|---|---|
| R1 | S11, S13, S17, S18, S19, S40, S41 (every step keeps the suites green) |
| R2 | S7, S10, S19 |
| R3 | S17, S18 |
| R4 | S6, S8, S10 |
| R5 | S6, S8, S10 |
| R6 | S3, S4, S5, S6, S7, S11, S13, S19 |
| R7 | S11, S19, S21 |
| R8 | S3, S13, S19, S21, S38 |
| R9 | S8, S9, S10, S12, S14, S15, S17, S18 |
| R10 | S10, S31, S36 |
| R11 | S1, S28, S31, S34, S35, S36 |
| R12 | S21, S30, S39 |
| R13 | S4, S20, S21, S30, S39, S41 |
| R14 | S8, S21 |
| R15 | S4, S21, S27, S29, S39 |
| R16 | S11, S13, S19, S21, S27 |
| R17 | S1, S21, S28, S39 |
| R18 | S20, S22 |
| R19 | S22, S23, S33, S37 |
| R20 | S20, S21 |
| R21 | S27, S29 |
