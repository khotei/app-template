# Postgres and Drizzle — plan

> Ticket: `2026-10-22-1915_postgres-drizzle` · Requirements: [feature.md](./feature.md) · Design: [architecture.md](./architecture.md)

## How to run this plan

- **Branch and commits.** Work happens on `feat/postgres-drizzle`, cut from `main`. Each step is
  one commit through `/ticket-implement`, made only after the user's OK, with the scope
  `postgres-drizzle`; before committing, set the step's `Status:` to `done`. The ticket's documents
  (`feature.md`, `architecture.md`, this plan) and the roadmap edit are committed together as
  `:memo: docs(postgres-drizzle)` when the plan is approved, before S1. `make vendor-drizzle` (S1)
  makes its own subtree commits, as `make vendor-effect` does; they are not part of S1's commit.
- **Green at every commit.** Each step leaves `make check` green, and `make dev` keeps working
  between steps: the Postgres adapters appear beside the key-value ones (S2, S5) and replace them
  only when the apps switch (S6), after the local database exists (S3).
- **Size.** A step changes ≤ ~400 lines, without `bun.lock`, `repos/drizzle` and the generated
  `snapshot.json` of a migration. S6 is mostly deletions.
- **Parallel lanes.** Steps without a path between them in the graph run in separate worktrees,
  each a branch from `feat/postgres-drizzle` named `postgres-drizzle-<step>-<topic>`, merged back
  fast-forward; the other lanes rebase. After S1: S2 → S4 → S5 beside S3. After S6: S7 → S8 → S9 →
  S11 beside S10 (then S13 once S7 and S10 are in) and beside S12. A worktree runs its own ports
  and `STAGE` ([tooling.md › Worktrees](../../knowledge/tooling.md#worktrees), extended in S3).
- **Docker.** `make test` needs a running Docker daemon from S1 on: the `globalSetup` starts one
  Postgres container per run and the MiniStack suites keep theirs per file. `make dev` needs
  `make up` from S6 on, which from S3 on creates the RDS instance, the bucket and the queues.
- **APIs are checked, not remembered.** Effect against `repos/effect`; Drizzle against
  `repos/drizzle/drizzle-orm/src` (vendored in S1); `@effect/sql-pg` against its installed sources;
  MiniStack and `@pulumi/aws` against the live experiments recorded in `architecture.md`. The
  session's scratchpad holds working calls: `exp/`, `exp/src2/` (Drizzle on `@effect/sql-pg`,
  migrator, kit, `snakeCase.table`), `test-infra/vt` (vitest `globalSetup` with `provide`/`inject`
  under Bun), `test-infra/` (Testcontainers, template database), `ministack-rds/src` (MiniStack's
  RDS source: labels, names), `rds-spike/proj/` (the instance through `@pulumi/aws`).
- **Tests only at the Seams 1–9** of `architecture.md`; Seam 10 (`make up`, `down`, `reset`, a
  worktree) is checked by hand in S3 and S6.
- **Living docs move with behaviour.** `docs/knowledge/database.md` is created in S2 and grows in
  S3, S6, S7, S8, S9, S10, S11, S12 and S13; each step that writes a knowledge page trims any rule
  or `CLAUDE.md` line that would restate it.
- **Deviations** go into the step's findings, `architecture.md › Decisions` when they are
  decisions, and `feature.md` when they change a requirement. Ticket ids stay out of code, rules
  and `docs/knowledge/` (`make ids`).

## Dependency graph

```mermaid
graph LR
  S1[S1 Drizzle, PgClient, Db, the test database] --> S2[S2 users: entity, migrations, make migrate]
  S1 --> S3[S3 the local stand on Pulumi: make up, down, reset]
  S2 --> S4[S4 chats, messages, attachments: entities, relations]
  S4 --> S5[S5 Postgres repositories on today's ports]
  S3 --> S6[S6 the apps and the harnesses on Postgres; KV removed]
  S5 --> S6
  S6 --> S7[S7 one active message per chat, stage guards, the cascade]
  S7 --> S8[S8 bind, touch, updateTitle]
  S8 --> S9[S9 the transaction; UserLock removed]
  S6 --> S10[S10 the outbox table, QueueClientOutbox, the relay]
  S9 --> S11[S11 the outbox in the send]
  S10 --> S11
  S6 --> S12[S12 read models as relational queries]
  S7 --> S13[S13 dead-letter consumers]
  S10 --> S13
```

The critical path is S1, S2, S4, S5, S6, S7, S8, S9, S11. S3 runs beside S2–S5; S10, S12 and
S13 run beside S7–S9. S12 touches `application/chat/chat.service.ts` as S7–S9 do, in other
methods; running it after S9 avoids merge work.

## Steps

#### S1 — Drizzle and `@effect/sql-pg`, the `Db` service, a test database per test

- **Goal:** the dependencies and the two layers every later step builds on. Catalogs: `drizzle`
  (`drizzle-orm`, `drizzle-kit` `1.0.0-rc.5`), `@effect/sql-pg@4.0.5` in `effect`,
  `@testcontainers/postgresql@12.2.1` in `runtime`; `make vendor-drizzle` and `repos/drizzle`.
  `DatabaseConfig { url: Redacted }` from `DATABASE_URL` in `@app-template/config`;
  `postgresImage` (`postgres:18.6-alpine` by digest) in `packages/config/postgres.ts`.
  `infrastructure/db/db.client.ts`: `Db`, a `Context.Service` over `PgDrizzle.make()` from
  `drizzle-orm/effect-postgres`; `Db.layer` needs `PgClient` and provides Drizzle's
  `EffectCache.Default` and our `EffectLogger`, which logs each statement at `Debug` with the SQL
  and the parameters as `query` and `params` log annotations (`Effect.annotateLogs`, so
  `recordLogs` reads them); `PgClientFromConfig` (`DatabaseConfig` → `PgClient.layer({ url })`)
  and `Db.layerFromConfig` over it, which also publishes `PgClient` for transactions (D3).
  `infrastructure/db/migrate.ts`, the program `make migrate` runs
  (`DatabaseConfig` → `PgClient` → `migrate(db, { migrationsFolder })` from
  `drizzle-orm/effect-postgres/migrator`), with the folder `infrastructure/db/migrations/` present
  and empty (`.gitkeep`; the migrator reads the folder's subfolders and creates
  `drizzle.__drizzle_migrations` when there are none); `migrateDatabase` returns the count it
  applied and `applyMigrations` logs `nothing to apply` or `applied N migration(s)`; `make migrate`
  in the `Makefile`.
  Tests: `infrastructure/db/testing/postgres.setup.ts` as vitest's `globalSetup` (one
  `PostgreSqlContainer(postgresImage)` per run; the `template` database migrated by the same
  program through `setupTemplateDatabase` and marked `IS_TEMPLATE`; its client closed;
  `project.provide('databaseUrl', <admin url>)`; teardown, or a failed template, stops the
  container) and `PgClientTest` in `packages/testing/postgres.ts`, provided per test
  (`inject('databaseUrl')`, `CREATE DATABASE test_<random> TEMPLATE template`, `PgClient.layer` on
  it, the scope's release drops it `WITH (FORCE)`), with the `ProvidedContext` augmentation and
  every name of the protocol beside it; `DbTest` in `infrastructure/db/testing/db.ts` is `Db.layer`
  over it and publishes `PgClient` (R15, R19, R20; D1, D3, D10, D12, D14, D15, D16).
- **Blocked by:** none.
- **Files:** root `package.json` (catalogs), `Makefile` (`vendor-drizzle`, `migrate`),
  `vitest.config.ts` (`globalSetup`), `.env.example` (`DATABASE_URL="postgres://app:app@localhost:15432/app_template"`
  replacing the commented stub); `packages/config/{config.ts,config.test.ts,postgres.ts,index.ts}`;
  `packages/testing/{postgres.ts,postgres.test.ts,index.ts,package.json}` (`@effect/sql-pg`,
  `vitest`); `infrastructure/db/{db.client.ts,db.client.test.ts,migrate.ts,migrate.test.ts,migrations/.gitkeep}`,
  `infrastructure/db/testing/{postgres.setup.ts,db.ts}`, `infrastructure/package.json` (`drizzle-orm`,
  `@effect/sql-pg`; dev `drizzle-kit`, `@testcontainers/postgresql`); `.claude/rules/effect.md`
  (Drizzle APIs are checked against `repos/drizzle/drizzle-orm/src`), `.claude/rules/naming.md`
  (`.client` also in `infrastructure/db`; `.setup`: a vitest `globalSetup` module, in `testing/`),
  `.claude/rules/effect-tests.md` (a database suite provides its stack per test),
  `.claude/rules/effect-services.md` (the `provideMerge` exception), `docs/knowledge/tooling.md`
  (the `drizzle` namespace, `vendor-drizzle`, `make migrate`, Docker and the Postgres container
  under Tests), `docs/knowledge/roadmap.md` (a database per test), this ticket's `feature.md` (R20)
  and `architecture.md` (D10),
  `infrastructure/CLAUDE.md` (`db/` holds the client, the migrations and the test setup),
  `packages/CLAUDE.md` (`config` holds the pinned MiniStack and Postgres images).
- **Test first:** Seam 2 — `db.client.test.ts` on `DbTest`: `select 1` through `Db` returns one
  row; the layer's database is not the admin's (`current_database()` starts with `test_`); a table
  created on one provided `DbTest` is absent from the next; with `MinimumLogLevel` at `Debug` and `recordLogs('query', 'params')`, one statement
  logs one `Debug` line carrying its SQL and its parameters; at `Info` the same statement logs
  nothing. `migrate.test.ts`: on a copy of the migrated template `migrateDatabase` returns `0`
  and `applyMigrations` logs one `Info` line, `nothing to apply`. `postgres.test.ts`: the test's
  `test_…` database is gone from `pg_database` once its scope closes. `config.test.ts` gains the
  `DATABASE_URL` row (a `Redacted`).
- **Verify:** `make check` with Docker running; `docker ps` during `make test` shows one
  `postgres:18.6-alpine` container and none after; `make test` from a shell without `.env` passes;
  `make migrate` against a reachable Postgres (a Testcontainers one from the scratchpad) creates
  `drizzle.__drizzle_migrations` and applies nothing. Findings record the container's measured
  start time, the template copy's time and `du -sh repos/drizzle`; if the subtree is several times
  `repos/effect`, the user decides before the commit.
- **Status:** done
- **Findings:**
  - Measured: the container starts in 1204 ms; a copy of the template takes 12–22 ms; a test's
    own database (create, connect, drop) costs a median of 40 ms (34–43 ms over 20 runs).
    `repos/drizzle` at `v1.0.0-rc.5` is about 36M on a shallow clone, against 53M for
    `repos/effect`, so no decision was needed. `make vendor-drizzle` makes its own commit on a
    clean tree, so it runs right after S1's commit; until then `effect.md` points at a
    `repos/drizzle` that does not exist.
  - **A database per test, not per file** (S1.2, the user's call on review). Within a file the
    tests shared rows, so a test that reads a whole table (`select * from messages`, the relay,
    the dead-letter consumers, a future admin view) saw an earlier test's rows. R20, its
    acceptance row and D10 now say per test, with TRUNCATE, a rolled-back transaction per
    test and owner-scoped rows rejected there. `effect-tests.md` gains the per-test rule.
  - `DbTest` is built with `Layer.provideMerge`, as `Db.layerFromConfig` is, so a suite can open
    `SqlClient.withTransaction`; `effect-services.md` states that exception. No test exercises
    the published `PgClient` yet: S9's transaction suite is the first.
  - `make migrate` landed here, not in S2, since its target exists from S1; S2's Files no
    longer list it. `migrateDatabase` counts the ledger rows before and after, because
    Drizzle's Effect migrator returns `void`.
  - `docs/knowledge/sdd.md` was not edited: its dependency map lists skills and agents, not the
    vendored repositories (`repos/effect` is not there either).
  - The test-database protocol (the template's name, the `databaseUrl` key, the `test_` prefix,
    the admin client) lives only in `@app-template/testing`; the `globalSetup` imports it, so
    no name is spelled twice across the two workspaces.

#### S2 — `users` and `credentials`: the first entity, the migrations, `UserRepositoryPg`

- **Goal:** the pattern every entity follows. `infrastructure/db/columns.ts` (`id()`, a `uuid`
  primary key with `DEFAULT uuidv7()`, and `createdAt()`, a `timestamptz` column with no default;
  each a fresh builder; `updatedAt()` lands with the first table that needs it, in S4);
  `infrastructure/drizzle.config.ts` (`dialect: 'postgresql'`, `schema: './*/*.entity.ts'`, `out:
  './db/migrations'`, no credentials); tables are declared with `snakeCase.table` from
  `drizzle-orm/pg-core`, which is what maps `camelCase` columns to `snake_case` names.
  `infrastructure/user/user.entity.ts` (`users`, `credentials` with the `credential_kind` enum
  from `Credential.fields.kind.literal`, the hash check on `secretHashPattern`, which `domain/user`
  exports for `SecretHash` and the check alike, the cascade; `UserRow` and `UserInsert` from
  `createSelectSchema`/`createInsertSchema` refined with `UserId` and `Schema.DateTimeUtcFromDate`;
  the credential row is written from the domain's values with no codec); the first migration
  folder from `make migration NAME=users`; `make migration` (`cd infrastructure && bunx
  drizzle-kit generate --name $(NAME)`) and `make migration-check` (generate with stdin closed;
  fail, printing the SQL, if a new folder appeared, and remove it; folder listings, not git),
  `migration-check` in `make check` and as a step of CI's `static` job. `UserRepositoryPg` beside
  `UserRepositoryKv` in `user.repository.ts`: `insert` writes the two tables in one
  `sql.withTransaction`, `selectByCredential` joins, every method ends with `orDieWithSqlError`;
  `UserPg` beside `UserKv` in `infrastructure/user/index.ts`. `infrastructure/db/db.client.ts`
  gains `isSqlError`, `unwrapQueryError` (a Drizzle query error's own `SqlError`) and
  `orDieWithSqlError`; `migrateDatabase` fails with the `SqlError` and the `make migrate` program
  runs through `BunRuntime.runMain`. `docs/knowledge/database.md` is created (schema and entity
  files, codecs, repositories, migrations, tests) (R3, R4, R14; D2, D9, D13).
- **Blocked by:** S1.
- **Files:** `infrastructure/db/{columns.ts,db.client.ts,migrate.ts,migrate.test.ts}`,
  `infrastructure/db/migrations/<ts>_users/{migration.sql,snapshot.json}` (the S1 `.gitkeep`
  removed), `infrastructure/drizzle.config.ts`,
  `infrastructure/user/{user.entity.ts,user.repository.ts,user.repository.test.ts,index.ts}`,
  `infrastructure/package.json` (`@effect/platform-bun` to `dependencies`), `bun.lock`,
  `domain/user/user.model.ts` (`secretHashPattern`), `packages/testing/postgres.ts`
  (`PgClientUnauthenticated`; `buildDatabaseUrl` takes `{ database, password? }`), `Makefile`
  (`migration`, `migration-check`, `check`, the `help` column), `biome.json` (skips
  `infrastructure/db/migrations`), `.github/workflows/ci.yml` (`make migration-check` in `static`);
  `docs/knowledge/database.md` (new), `docs/knowledge/architecture.md` (a Postgres table on the
  `user` slice under "Where things live"; links `database.md`), `docs/knowledge/tooling.md` (the
  migration targets, `migration-check` in CI), `.claude/rules/naming.md` (`.entity`;
  `<Entity>Kv` and `<Entity>Pg` bundles; a tool's config file keeps the name its tool reads),
  `infrastructure/CLAUDE.md` (a repository runs on Postgres through `db/` and its `.entity.ts`).
- **Test first:** Seam 3 — `user.repository.test.ts` becomes one suite run over
  `UserRepositoryKv` and `UserRepositoryPg` (on `DbTest`): insert, select by id
  and by credential round-trip equal models (`assertSchemaEquals`), an unknown credential is
  `none`; on Postgres only: `users.created_at` has no default (`information_schema.columns`), and
  `credentials.hash` rejects a non-hex value through the check. Seam 2 — the migration applies to
  the template, and `make migrate` on the test database is a no-op the second time.
- **Verify:** `make check`; `make migration NAME=probe` with no database reachable writes a
  folder, which is then removed; `make migration-check` fails, printing the missing SQL, after a
  column is added to `user.entity.ts` without a migration, and after `secretHashPattern` changes,
  passes once each is reverted, passes with an uncommitted migration that matches the entities,
  and fails with drizzle-kit's `--hints` instead of hanging on a rename; `make migrate` with a
  wrong password logs the `AuthenticationError` and `password authentication failed`, exit 1;
  `psql` against a migrated database: `\d users` shows `id uuid DEFAULT uuidv7()`, `created_at
  timestamptz` with no default, `\d credentials` the hash check.
- **Status:** done
- **Findings:**
  - `make migration-check` is soft in `make check` and strict in CI (D13, Seam 9): failing on
    uncommitted migrations, as planned, would turn the pre-commit gate red on every step that
    adds one. It compares folder listings, so it never removes a folder it did not write.
  - drizzle-kit runs from `infrastructure/`: from the root, `bunx` missed the workspace's pinned
    binary and fetched another, and the schema glob resolves against the working directory.
    In a non-TTY it does not prompt on a rename; it exits 2 naming the `--hints` it needs.
  - Biome skips `infrastructure/db/migrations/`, drizzle-kit's output.
  - drizzle-kit inlines `${secretHashPattern.source}` into the check's DDL; a changed pattern
    needs a migration.
  - The credential row needs no codec (D2): its values are already the domain's.
  - `updatedAt()` moves to S4, the first step with a table that has the column.
  - `sql.withTransaction` covers Drizzle's queries on `DbTest`: the duplicate-credential test
    fails without it. It is the first test of the published `PgClient` (S1's finding).
  - Drizzle's `EffectDrizzleQueryError` hides the driver's reason (`Failed query: …` only);
    `unwrapQueryError` and `orDieWithSqlError` in `db.client.ts` surface the `SqlError`, and every
    Postgres repository method ends with the latter (S5 follows it).
  - `make migrate` runs through `BunRuntime.runMain`, so `@effect/platform-bun` is a runtime
    dependency of `infrastructure`.
  - Tests beyond the plan: the duplicate credential (transaction, `UniqueViolation` defect), the
    template's ledger counts every migration folder, `migrateDatabase` on a wrong password fails
    with `AuthenticationError` (`PgClientUnauthenticated`), the Kv key test kept in a suite of
    its own.
  - The step landed in five rounds, S2.1–S2.5, after three reviews.

#### S3 — The local stand on Pulumi: MiniStack with the database, the bucket and the queues

- **Goal:** one Pulumi program in `deployment/local` (`runtime: bun`) creates the whole local
  stand, and nothing else creates resources for `make up`. It runs the MiniStack container
  (`@pulumi/docker`; image `ministackImage` bumped to MiniStack 1.5.31 by digest; the Docker
  socket, `MINISTACK_RDS_PUBLIC_ENDPOINT=1`, `RDS_PERSIST=1`, `RDS_BASE_PORT` from `.env`, the
  persistence variables as today) and, through an `aws.Provider` that `dependsOn` the healthy
  container (`endpoints: [{ rds, s3, sqs }]`, the three skip flags, `s3UsePathStyle`), creates
  inside it: the RDS Postgres 18 instance (`identifier`
  `buildResourceName(STAGE, 'database')`, credentials and database name fixed in
  `deployment/local/settings.ts`, `skipFinalSnapshot`, `publiclyAccessible`,
  `maxAllocatedStorage` = `allocatedStorage`), the inventory's bucket with its lifecycle rule and
  its queues with their dead-letter queues and `RedrivePolicy`, all read from `packages/aws`
  (names by `buildResourceName(STAGE, …)`, the rule the apps use). The resource code lives in
  `deployment/aws/{database,storage,queue}.ts` as functions of a provider, so ticket 9's prod
  stack calls the same code without an endpoint. The program exports `DATABASE_URL` (host port
  from the instance's endpoint, not a secret); `make up` writes `pulumi stack output --shell` to
  `.env.pulumi` (gitignored), and the app scripts and `make migrate` load it as a second
  `--env-file` after `.env`. Configuration is read once, in `deployment/local/settings.ts`, from
  the `@app-template/config` layers. `make up` = refresh of the MiniStack container alone, once it is in the state →
  `pulumi up` with `VCR_MODE=REPLAY_ONLY` and a non-empty `VCR_PATH` (the provider's own switch
  that drops its fixed waits: 8 s instead of 87 s cold; local stack only; if a provider release
  drops it, `make up` is slow again, never wrong) → `.env.pulumi` → `make migrate`, which retries while the database refuses connections
  (`ConnectionError`, `cannot_connect_now`) and gives up at once otherwise; `make down` =
  `docker stop` of the MiniStack container (MiniStack removes the instance's container and keeps
  its volume and state); `make reset` = `docker rm -f` of the MiniStack container and of the instance's container (its
  MiniStack labels) → `docker volume rm` of
  the instance's volume (MiniStack keeps it after `DeleteDBInstance`) → `rm -rf .data .env.pulumi`, no
  `pulumi destroy`. `deployment/local/provision.ts` and `check-database.ts` go; `provision` in
  `packages/aws` stays for the tests. A worktree sets its own `STAGE` (`local<N>`) and
  `RDS_BASE_PORT` (`15432 + 10N`): MiniStack names the instance's container and volume by the
  identifier, not by the port; the worktree block of `.claude/skills/ticket-implement/SKILL.md`
  writes both (R15, R16, R17, R18; D11, D15).
- **Blocked by:** S1.
- **Files:** `deployment/local/{Pulumi.yaml,index.ts,settings.ts,ministack.ts,README.md}`,
  `deployment/local/{provision,check-database,postgres}.ts` and `deployment/Pulumi.yaml` (deleted),
  `deployment/aws/{provider,database,storage,queue,index}.ts`, `deployment/package.json` and the
  root `package.json` (`pulumi` catalog: `@pulumi/aws`), `packages/config` (`ministackImage`, `MiniStackConfig`, `config.test.ts`),
  `infrastructure/db/{migrate,migrate.test}.ts` (the connection retry),
  `Makefile`, `.gitignore` (`.env.pulumi`), `.env.example` (`RDS_BASE_PORT`; `DATABASE_URL`
  leaves it), `apps/*/package.json` scripts (the second `--env-file`), `.claude/rules/tooling.md`
  (one hand-written `.env` plus the generated `.env.pulumi`),
  `.claude/skills/ticket-implement/SKILL.md` (the worktree block), `deployment/CLAUDE.md`,
  `docs/knowledge/aws.md` (The local stand-in), `docs/knowledge/tooling.md` (Worktrees, .env),
  `docs/knowledge/roadmap.md` (entry 9: the bucket and queues are in Pulumi already),
  `docs/knowledge/database.md` (The local database, the `make migrate` row),
  `docs/knowledge/architecture.md` (the deployment row), `README.md`, `feature.md` (R15, R16, R17,
  R18, R22; the `rds.Instance` question closed).
- **Test first:** Seam 2 — `retryWhileUnreachable` retries a closed port and a starting database
  until they answer, gives up after its bound, and fails at once on a refused password;
  `config.test.ts`: a missing `RDS_BASE_PORT` fails. Seam 10 is by hand.
- **Verify:** from `make reset`: `make up` creates the instance, the bucket and the queues
  (findings record the time with and without `VCR_MODE`); `.env.pulumi` holds `DATABASE_URL`;
  `select 1` through it works and `drizzle.__drizzle_migrations` exists; the bucket's lifecycle
  rule and each queue's redrive read back as the inventory says; a second `make up` changes
  nothing and finishes in seconds; `make down` then `make up` migrates once the respawned database
  listens; a row inserted by hand survives `make down` then `make up`
  with the same port; `make reset` leaves no container or volume of this tree and no `.data/` or `.env.pulumi`;
  a worktree with `N=1` (`STAGE="local1"`, ports 3010/3011/4576, `RDS_BASE_PORT=15442`) runs
  `make up` beside the main tree; `make check` is green.
- **Status:** done
- **Findings:**
  - Measured on 2026-10-24, the main tree (`N=0`) and a worktree (`N=2`) side by side, each phase
    started in both at once, with `VCR_MODE`:

    | Phase | Main | Worktree |
    |---|---|---|
    | `make up` from `make reset` | 8.3 s | 8.4 s |
    | `make up` on a running stand | 2.9 s | 2.9 s |
    | `make down` | 0.5 s | 0.4 s |
    | `make up` after `make down` | 6.1 s | 6.1 s |
    | `make reset` | 0.3 s | 0.3 s |

    Of a cold 8 s, Pulumi spends ~3.3 s creating the MiniStack container, ~0.5 s on the bucket
    and the queues and ~2 s on the RDS instance; `make migrate` takes ~0.2 s. Without `VCR_MODE`
    a cold `make up` took 87 s (S3.3). `select 1` through `.env.pulumi` answers in ~10 ms in both
    trees, each on its own port (15432, 15452).
  - The first `make up` in a fresh tree also downloaded the AWS provider plugin, 858 MB, into
    that tree's `.pulumi/`: 44 s instead of 8 s, once per tree. After S4, every tree's
    `PULUMI_HOME` became the main tree's `.pulumi/`, and `PULUMI_BACKEND_URL` names each tree's
    backend per command in place of `pulumi login`, so a shared home stores no tree's login. A
    worktree with no `.pulumi/` then ran its first `make up` in 9 s, beside the main tree's,
    downloading nothing.
  - `make down` makes MiniStack remove the instance's container, not stop it; the volume keeps
    the data. The next `make up` recreates the MiniStack container, since the refresh sees it
    stopped (`~ports`), and MiniStack recreates the instance's container on the same port; the
    other 10 resources are unchanged, a hand-inserted row survives, and `make migrate` found the
    database listening in every run (no retry logged).
  - The bucket's lifecycle rules (`expire-unbound` on the tag, `abort-incomplete-uploads`) and
    each queue's redrive (`maxReceiveCount` 3 and 5) read back from MiniStack as the inventory
    says. `make reset` leaves no container or volume of the tree.
  - Deviations from the plan as written before S3: the database credentials and name are
    constants in `deployment/local/settings.ts`, not stack config; `MiniStackConfig` in
    `packages/config` carries the image and `RDS_BASE_PORT`; `make reset` also removes the
    instance's container by its MiniStack labels; `make up` refreshes the MiniStack container
    alone and only once it is in the state, since `up --refresh` with MiniStack stopped drops the
    bucket from the state; `make migrate` retries while the database is unreachable.
  - The worktree check ran with `N=2` (`STAGE="local2"`, MiniStack on 4586, the database on
    15452) instead of `N=1`, which the S4 worktree held.
  - The step landed in five rounds, S3.1–S3.5. S3.1 ran the database on MiniStack through
    `provision.ts`, and S3.2 replaced it with a plain Postgres container; both were rejected for
    one Pulumi program (S3.3, D11). S3.4 is ~700 changed lines, kept as one commit by the user's
    choice.

#### S4 — `chats`, `messages` and `attachments`: the entities, the relations, the migration

- **Goal:** the remaining tables, declared once with their constraints, one entity file per
  entity as the folder's repositories are split. `chat.entity.ts`: `chats` (the `title` check from
  `maxTitleLength`, the `(user_id, updated_at desc)` index), `ChatRow`, `ChatInsert`;
  `message.entity.ts`: `messages` (`message_author` and `message_stage` enums from the domain
  literals, `error jsonb`, the `(chat_id, created_at)` index, the partial unique index
  `messages_chat_id_active_index` whose predicate is one exported `sql` constant, `activeMessage`,
  rendered with `.inlineParams()`), `MessageRow`, `MessageInsert` with `error` refined to
  `Schema.OptionFromNullOr(MessageFailure)`; `attachment.entity.ts`: `attachments` (`message_id` →
  `messages` with `RESTRICT`, the file-name, media-type (`~*` on `mediaTypePattern`) and size
  checks, the `(message_id, created_at, id)` index), `AttachmentRow`, `AttachmentInsert`;
  `infrastructure/db/relations.ts`: `defineRelations` over every table (user → chats, chat →
  messages, message → attachments by `attachments.message_id`); `PgDrizzle.make({ relations })` in
  `Db` so `db.query` is typed; the migration from `make migration NAME=chats`. The foreign key is
  the only link between a message and its attachments, which read in upload order. A relational
  query runs live here, before any repository uses one (R3, R4; D2, D6, D9, D17).
- **Blocked by:** S2.
- **Files:** `infrastructure/chat/{chat.entity.ts,chat.entity.test.ts,message.entity.ts,message.entity.test.ts}`,
  `infrastructure/attachment/{attachment.entity.ts,attachment.entity.test.ts}`,
  `infrastructure/db/{relations.ts,db.client.ts,columns.ts}` (`updatedAt()`),
  `infrastructure/db/testing/{db.ts,rows.ts}`, `infrastructure/db/migrations/<ts>_chats/`,
  `domain/attachment/attachment.model.ts` (`mediaTypePattern`),
  `infrastructure/user/{user.repository.ts,user.repository.test.ts}` (`.limit(1)`),
  `infrastructure/CLAUDE.md`, `docs/knowledge/architecture.md` (`relations.ts`),
  `docs/knowledge/database.md` (the schema section grows: the partial index, the enums, the
  checks, relations, one link and upload order, `.limit(1)`), `feature.md` (R4: upload order).
- **Test first:** Seam 2 on `PgClientTest`: `chat.entity.test.ts` reads a `Chat` with and without
  a title back as the model it was written from and refuses a title over `maxTitleLength`;
  `message.entity.test.ts` does the same for a `Message` of each stage, a `failed` one with
  `MessageFailure` and `cause`, refuses two active assistant messages in one chat on
  `messages_chat_id_active_index` while an active one beside a `completed` one is accepted, checks
  that `activeMessage` renders as literals so the query binds only the chat id, and nests a chat's
  messages through `db.query.chats.findMany({ with })`; `attachment.entity.test.ts` reads an
  attachment back with `messageId` `none` and `some`, refuses an empty file name, a bad media type
  and a negative size, and nests a message's attachments by `created_at` then `id`, not by insert
  order.
- **Verify:** `make check`; `make migration-check` passes; `psql`: `\d messages` lists the
  `snake_case` columns and the partial index with its predicate.
- **Status:** done
- **Findings:**
  - `messages.attachment_ids` went in S4.4 (D17): the bind's foreign key is the only link, and a
    message's attachments read in upload order. `feature.md` R4 says so; the `202` of a send still
    lists them in the request's order, since the bind returns them that way.
  - The predicate of the partial index is rendered with `.inlineParams()`: with bound parameters,
    `ON CONFLICT … WHERE` matches the index until a prepared statement switches to its generic
    plan, after five runs. A relational query aliases its tables, so `activeMessage` serves the
    core query builder only; S12 needs the relational filter.
  - The chats migration was regenerated in place twice (S4.2, S4.4): it never reached the ticket
    branch. A local database that applied an earlier S4 round needs `make reset`.
  - `attachments_media_type_check` matches `mediaTypePattern` with `~*`, its `i` flag; Postgres and
    JavaScript agreed on nine probe values.
  - Queries that expect one row end with `.limit(1)`; `UserRepositoryPg` follows it, and
    `database.md` states the rule.
  - A partial index is named `<table>_<columns>_<predicate>_index`.
  - The step landed in five rounds, S4.1–S4.5, after three reviews.

#### S5 — The Postgres repositories on today's ports

- **Goal:** `ChatRepositoryPg`, `MessageRepositoryPg` and `AttachmentRepositoryPg` beside the
  `Kv` ones, implementing the ports as they are today (`insert`, `update`, `selectById`,
  `selectByUser`, `delete`; `selectByChat` in creation order, `selectActiveByChat` with the
  active condition as a relational object filter, `deleteByChat`; `selectByIds` in the order
  asked, `deleteByIds`), each method one Drizzle statement with the codecs of S4: every read a
  relational query (`db.query…findFirst`/`findMany`), every write the core builder, which also
  moves `UserRepositoryPg`'s reads onto `db.query`; `MessageRepositoryPg` nests the message's
  attachment ids in upload order and fills `Message.attachmentIds` from them (D17); `ChatPg` and
  `AttachmentPgS3` in the aggregates' `index.ts` beside `ChatKv`, `AttachmentKv`,
  `AttachmentKvS3`, and no bundle pairs the Postgres repository with `AttachmentStoreKv`
  (R1, R4; D1, D2, D6).
- **Blocked by:** S4.
- **Files:** `infrastructure/chat/{chat.repository.ts,chat.repository.test.ts,message.repository.ts,message.repository.test.ts,index.ts}`,
  `infrastructure/attachment/{attachment.repository.ts,attachment.repository.test.ts,index.ts}`,
  `infrastructure/user/{user.repository.ts,user.repository.test.ts,user.entity.ts}`,
  `infrastructure/{chat,attachment}/*.entity.ts` and their tests (one decoder each),
  `infrastructure/db/{db.client.ts,relations.ts}` (`decodeFound`, `users → credentials`),
  `infrastructure/testing/{db-test.ts,rows.ts,repository-stacks.ts}` (moved from
  `db/testing/`), `infrastructure/CLAUDE.md`, `docs/knowledge/database.md` (the read/write
  split, the relational filter, test support).
- **Test first:** Seam 3 — each of the three suites becomes one suite run over its `Kv` and `Pg`
  layers, red on `Pg` until the adapter exists: the existing cases, plus on Postgres
  `selectActiveByChat` finds the active message among terminal ones, `selectByChat` returns
  creation order with equal `createdAt` broken by id, `deleteByIds` with an unknown id skips it.
  A shared case with attachments binds them in upload order, so `Kv` and `Pg` agree; upload order
  against a different send order is a `Pg` case.
- **Verify:** `make check`; the three suites each list both layers in their output.
- **Status:** done
- **Findings:**
  - Every Postgres repository reads through `db.query` and writes through the core builder;
    `findFirst` emits `limit 1` itself, so this supersedes S4's "queries that expect one row end
    with `.limit(1)`". `decodeFound` (in `db.client.ts`) decodes a single-record read. A message's
    attachment ids arrive as a `json_agg` array inside its row, so a `limit` never cuts them.
  - `selectActiveByChat` filters with the object filter `{ author: 'assistant', stage: { in:
    ActiveMessageStage.literals } }` (D18), not `activeMessage`: a relational query aliases its
    tables, and the user chose the readable filter over a `RAW` callback. `activeMessage` stays
    the index's predicate. A shared case keeps a user message in an active stage beside the
    active reply, since `Option.filter(isActiveMessage)` hides a user message read alone.
  - `selectByCredential` filters on the `users → credentials` relation, which Drizzle renders as
    `exists (…)`; a relational `in` with an empty list renders `1 = 0`, as `inArray` does.
  - Each entity file exports one decoder beside its codec; repositories and entity tests share
    it. Shared test support moved to `infrastructure/testing/` (`db-test.ts`, `rows.ts`,
    `repository-stacks.ts`, the stacks of every repository on each store); `db/testing/` keeps
    only the vitest `globalSetup`. S4's file list names the old paths.
  - `selectByChat` breaks equal `createdAt` by id on Postgres; the key-value case that read one
    millisecond's messages in insertion order is a `Kv`-only case until S6. A user message and
    its reply share `createdAt` in `SendMessageUseCase`, so their order rests on UUIDv7 ids
    rising; S6 checks it on Postgres.
  - S5.1 changed ~720 lines (~190 adapters, the rest the suites over both stores), above the
    ~400 guide: the suites arrange each other's foreign keys through the Postgres adapters.
  - Running the tests of one file concurrently (`--sequence.concurrent`) passed every Postgres
    suite, since each test owns its database, and cut `make test` from 21.7 s to 11.3 s, almost
    all of it `packages/queue/queue.test.ts` (19.3 s → 9 s of real SQS waits). Three files that
    share one built layer failed; S6 takes this on. One MiniStack per test run instead of one
    per file (S6 adds MiniStack to every harness suite) is weighed at the ticket's end, by the
    user's call, from a measurement of solo, concurrent and two-tree runs.
  - The step landed in five rounds, S5.1–S5.5, after four reviews.

#### S6 — The apps and the harnesses on Postgres; the key-value store removed

- **Goal:** the api and the worker read and write Postgres; nothing keeps a record in a key-value
  store. `apps/api/src/layer.ts` provides `UserPg`, `ChatPg`, `AttachmentPgS3` and
  `Db.layerFromConfig` in place of `UserKv`, `ChatKv`, `AttachmentKvS3`, `KeyValueStoreFileSystem`;
  `apps/worker/src/layer.ts` likewise. `application/testing/chat.harness.ts` and
  `apps/api/src/testing/api.harness.ts` build their services on `ChatPg`, `AttachmentPgS3`,
  `UserPg` over `PgClientTest` + `Db.layer` and the tests' MiniStack, so the service, use case,
  job and api suites run on Postgres and keep attachment bytes in S3; `AttachmentStoreKv` goes,
  and the tests that counted the store's keys count the bucket's objects. Removed: `infrastructure/kv/` and its tests, every `*Kv` layer and bundle,
  `StoreConfig`, `STORE_PATH` (code, `.env.example`, docs), the `.data/store` mention in the
  `Makefile`. The suites of S2 and S5 drop their `Kv` layer and run on `Pg` alone
  (`repository-stacks.ts` keeps one stack). The tests of a file run concurrently
  (`sequence: { concurrent: true }` in `vitest.config.ts`): each test owns what it writes (its
  database, its bucket objects and queue names under a unique prefix), and a suite that must
  share one built layer is `describe.sequential` (R1, R2, R15, R20, R21).
- **Blocked by:** S3, S5.
- **Files:** `apps/api/src/{layer.ts,layer.test.ts,testing/api.harness.ts}`,
  `apps/worker/src/layer.ts`, `apps/api/package.json`, `apps/worker/package.json`,
  `application/testing/chat.harness.ts`, `application/package.json`,
  `infrastructure/kv/*` (deleted), `infrastructure/package.json` (`./kv` export gone),
  `infrastructure/{user,chat,attachment}/{index.ts,*.repository.ts,*.repository.test.ts}`,
  `packages/config/{config.ts,config.test.ts}` (`StoreConfig` gone), `.env.example`, `Makefile`
  (the `reset` comment), `packages/CLAUDE.md` ("Objects and rows use effect's `KeyValueStore`"
  goes), `infrastructure/CLAUDE.md` (the KV line goes), `.claude/rules/naming.md` (`<Entity>Kv`
  goes; the harness runs on the test database, not the memory store),
  `docs/knowledge/architecture.md` ("Add a new entity" step 5: the entity file, the migration, the
  repository on `Db`), `docs/knowledge/tooling.md` (Environment: `STORE_PATH` gone; Tests: every
  suite that touches a repository needs Docker), `docs/knowledge/aws.md` (Attachments: "An
  attachment's record stays in the key-value store" → the `attachments` table),
  `docs/knowledge/database.md` (the apps' layers, the harnesses),
  `infrastructure/attachment/{attachment.storage.ts,attachment.storage.test.ts}` (`AttachmentStoreKv`
  goes), the suites that read the store (`application/attachment/attachment.service.test.ts`,
  `application/chat/{assistant-message.job.test.ts,chat-title.job.test.ts}`,
  `application/user/user.service.test.ts`, `apps/api/src/attachment/attachment.handler.test.ts`),
  `README.md` (the key-value store in the diagram and the adapters), `.gitignore`,
  `.claude/rules/effect-services.md` (the `KeyValueStore` layer examples),
  `infrastructure/testing/repository-stacks.ts`, `vitest.config.ts` (concurrent tests),
  `.claude/rules/effect-tests.md` (each test owns its resources; a shared layer runs
  sequentially), `docs/knowledge/tooling.md` (Tests: concurrency).
- **Test first:** Seam 7 — `apps/api/src/layer.test.ts` builds `ApiHttp` over `PgClientTest`;
  the handler suites pass unchanged on the Postgres harness (their red is the harness failing to
  build before the layers switch). Seam 5 and 6 — the application suites pass on the Postgres
  harness with no `layerMemory` left; the `interleaveMessages` and `AttachmentRepositoryYielding`
  cases keep passing here and are rewritten in S9.
- **Verify:** `make check`; `git grep -l KeyValueStore -- . ':!repos' ':!docs/tickets'` and
  `git grep -n STORE_PATH` are empty; `make up`, `make dev`: create a user, a chat, send a message
  with an attachment, `psql` shows the rows in the five tables and `.data/` has no `store/`;
  `curl localhost:3000/openapi.json` saved from `main` before the switch and after it: `diff`
  empty; `LOG_LEVEL="Debug" make dev-api` and one request print the SQL with `query` and `params`;
  at `Info` none; `make test` three times in a row green, and its wall time against S5's 21.7 s.
- **Status:** todo

#### S7 — One active message per chat, stage guards and the cascade

- **Goal:** the first database guards behind value-returning port methods. `MessageRepository`:
  `insert(message): boolean` (`ON CONFLICT (chat_id) WHERE <active> DO NOTHING RETURNING id`
  through Drizzle's `onConflictDoNothing({ target, where })`; `false` when the chat already has an
  active message), `update(message, { from }): boolean` (`WHERE stage = $from`); `deleteByChat`
  goes. `ChatRepository.delete` relies on the cascade from `chats` to `messages`, and a bound
  attachment makes it fail (`RESTRICT`). Application: `ChatService.addAssistantMessage` raises
  `ChatBusyError` on `false`; `AssistantMessageJob` passes `{ from }` on every stage write and
  treats `false` as settled by someone else, with the existing log `assistant reply skipped:
  already settled`; `ChatService.delete` is one `delete`; `DeleteChatUseCase` keeps the
  attachments-first order (their bytes are outside the transaction). `UserLock` stays until S9 (R9
  in part, R12; D5, D7).
- **Blocked by:** S6.
- **Files:** `domain/chat/chat.service.ts` (the two port signatures and their doc comments),
  `infrastructure/chat/{message.repository.ts,message.repository.test.ts,chat.repository.ts,chat.repository.test.ts}`,
  `application/chat/{chat.service.ts,chat.service.test.ts,assistant-message.job.ts,assistant-message.job.test.ts,delete-chat.use-case.ts,delete-chat.use-case.test.ts}`,
  `docs/knowledge/database.md` (the guards: the partial index and the conditional writes).
- **Test first:** Seam 3 — `insert` of a second active assistant message answers `false` and
  leaves one row; a `completed` message beside an active one is inserted; `update(…, { from:
  'preparing' })` on a `generating` row answers `false` and changes nothing; `chats.delete` removes
  the chat's messages; `chats.delete` with a bound attachment fails. Seam 6 — a message set
  `completed` by another writer while the job runs leaves the job's `generating` write unapplied
  and the job logs `assistant reply skipped: already settled`. Seam 5 — `addAssistantMessage`
  alone on a busy chat fails with `ChatBusyError`.
- **Verify:** `make check`; `git grep -n deleteByChat` is empty.
- **Status:** todo

#### S8 — `bind`, `touch` and `updateTitle`

- **Goal:** the remaining guards. `AttachmentRepository.bind(ids, messageId): ReadonlyArray<Attachment>`
  (one `UPDATE … WHERE id IN (…) AND message_id IS NULL RETURNING *`) replaces `update`;
  `ChatRepository.touch(id, at)` writes `updated_at` only; `ChatRepository.updateTitle(id,
  title): boolean` writes `WHERE title IS NULL` and its doc comment says so (`false`: titled
  meanwhile); `ChatRepository.update(chat)` stays for the rename. Application:
  `AttachmentService.bind(userId, ids, messageId)` selects, checks each with `ensureBindable`, runs
  `bind` and raises `AttachmentBoundError` for an id the update skipped; `findBindable` and the
  proof type `BindableAttachments` go; `SendMessageUseCase.send` calls `bind`; `ChatService.touch`
  replaces `touch-chat.ts`; `ChatTitleJob` writes through `updateTitle` and drops its re-read,
  keeping the log `chat title skipped: already titled`. `naming.md` gains the two verbs: `bind`
  and `touch` are conditional single-statement writes that answer with what they changed (R10 in
  part, R11 in part; D5).
- **Blocked by:** S7.
- **Files:** `domain/attachment/attachment.service.ts`, `domain/chat/chat.service.ts`,
  `infrastructure/attachment/{attachment.repository.ts,attachment.repository.test.ts}`,
  `infrastructure/chat/{chat.repository.ts,chat.repository.test.ts}`,
  `application/attachment/{attachment.service.ts,attachment.service.test.ts}`,
  `application/chat/{chat.service.ts,chat.service.test.ts,send-message.use-case.ts,chat-title.job.ts,chat-title.job.test.ts}`,
  `application/chat/touch-chat.ts` (deleted), `.claude/rules/naming.md` (the verbs),
  `docs/knowledge/database.md` (the guards section grows).
- **Test first:** Seam 3 — `bind` of three ids where one is already bound returns the two it
  bound and leaves the third's `message_id`; `touch` moves `updated_at` and keeps a title set
  meanwhile; `updateTitle` answers `false` on a titled chat and changes nothing. Seam 5 —
  `AttachmentService.bind` with a bound id fails `AttachmentBoundError` and binds nothing else
  (the statement is one). Seam 6 — the title job on a chat titled meanwhile logs `chat title
  skipped: already titled` and writes nothing.
- **Verify:** `make check`; `git grep -n -E 'findBindable|BindableAttachments|touchChat'` is empty.
- **Status:** todo

#### S9 — The transaction; `UserLock` removed

- **Goal:** the send and the delete commit as one transaction and the in-process lock goes.
  `SendMessageUseCase.send` is `Effect.fn('SendMessageUseCase.send')(function* …, sql.withTransaction)`
  with `SqlClient` from `effect/sql` in the use case's layer requirements (provided by
  `PgClient`); `DeleteChatUseCase` likewise; `UserLock` and its `withPermit` are deleted;
  `application/testing/chat.fake.ts` loses `interleaveMessages` and `AttachmentRepositoryYielding`
  and keeps one wrapper, `MessageRepositoryFailingInsert`, a `MessageRepository` layer that fails
  the assistant message's insert, for the rollback case. The concurrency tests run real concurrency
  on the test database. Rules: `use-cases.md › Concurrency` and `› Tests` are rewritten for the
  transaction and the database guards (R6 in part, R9, R10, R11; D3, D5).
- **Blocked by:** S8.
- **Files:** `application/chat/{send-message.use-case.ts,send-message.use-case.test.ts,delete-chat.use-case.ts,chat.service.ts}`,
  `application/user/{user-lock.ts (deleted),index.ts}`, `application/testing/chat.fake.ts`,
  `application/testing/chat.harness.ts`, `apps/api/src/chat/chat.handler.test.ts`,
  `.claude/rules/use-cases.md` (the transaction; the "order the writes so a crash and a retry"
  and "enqueue after the writes" rules, written for a store without transactions, go or narrow to
  the S3 bytes), `docs/knowledge/database.md` (the transaction),
  `docs/knowledge/architecture.md` (Seams: the use case suites run on the database).
- **Test first:** Seam 5 — two concurrent sends to one chat (`Effect.all` with unbounded
  concurrency, both inside the harness) complete exactly one and fail the other `ChatBusyError`,
  with one assistant message in the table and nothing from the loser; two concurrent sends in two
  chats binding one attachment complete one and fail the other `AttachmentBoundError`, the
  attachment bound once; a rename interleaved with a send keeps the title and moves `updated_at`;
  a send whose assistant insert fails leaves no message, no bind and an unchanged chat. Seam 7 —
  two concurrent `POST /chats/:id/messages` through the api harness answer one `202` and one
  `409`.
- **Verify:** `make check` three times (the concurrency cases are deterministic in outcome, not
  in winner); `git grep -n -E 'UserLock|withPermit|interleaveMessages|Yielding'` is empty; live
  with `make dev` and a second api on `API_PORT=3002`: two `curl` in parallel against the two
  processes, one `202`, one `409`, one assistant message in `messages`.
- **Status:** todo

#### S10 — The outbox table, `QueueClientOutbox` and the relay

- **Goal:** the outbox exists and the worker relays it; nothing writes to it yet but its tests.
  `infrastructure/outbox/outbox.entity.ts` (`outbox`: `id`, `queue`, `job_id`, `body`,
  `created_at`, the `(created_at)` index; `OutboxRow`, `OutboxInsert`) and its migration
  (`make migration NAME=outbox`). `QueueClientOutbox` in `infrastructure/shared/queue.client.ts`:
  `send` encodes the job with `packages/queue`'s `encodeBody` (exported from its `index.ts`) and
  inserts a row, joining the caller's transaction; `consume` dies with a message naming the api.
  `infrastructure/outbox/outbox.relay.ts`: `OutboxRelay`, a `Layer` constant that runs the relay
  in the worker (`Effect.forkScoped` under `Layer.effectDiscard`): in a transaction it selects
  `ORDER BY created_at, id LIMIT 10 FOR UPDATE SKIP LOCKED`, sends each row through
  `QueueTransport.send(buildResourceName(stage, queue), { body, attributes: { jobId } })`, deletes
  it and commits; an empty batch sleeps `QueueConfig.outboxPollInterval` (`OUTBOX_POLL_INTERVAL`,
  default 1 s), a full one polls again at once; a failed send fails the batch; the loop restarts
  on any cause with `consumerRestart`, exported from `packages/queue` for it. `apps/worker` adds
  `OutboxRelay` beside `QueueClientSqs`. `naming.md`: the `.relay` role, and a `Layer` constant
  that runs work and provides no service is PascalCase named for what it runs (`OutboxRelay`, as
  `LogWorkerLifecycle` in `apps/worker`) (R7, R8; D4).
- **Blocked by:** S6.
- **Files:** `infrastructure/outbox/{outbox.entity.ts,outbox.relay.ts,outbox.relay.test.ts,index.ts}`,
  `infrastructure/db/migrations/<ts>_outbox/`, `infrastructure/shared/{queue.client.ts,queue.client.test.ts}`,
  `infrastructure/package.json` (`./outbox` export), `packages/queue/{queue.ts,index.ts}`
  (`consumerRestart` exported; `encodeBody` added to the barrel), `packages/config/{config.ts,config.test.ts}`
  (`outboxPollInterval`), `.env.example` (`OUTBOX_POLL_INTERVAL="1 second"`),
  `apps/worker/src/{layer.ts,layer.test.ts}` (the test is new), `apps/worker/package.json`,
  `.claude/rules/naming.md`, `docs/knowledge/aws.md` (Queues: the relay publishes the outbox),
  `docs/knowledge/database.md` (the outbox), `docs/knowledge/architecture.md` ("Where things live":
  `.relay`).
- **Test first:** Seam 4 — `queue.client.test.ts`: `QueueClientOutbox.send` inside a transaction
  that then fails leaves no row; a committed send leaves one row with the queue's name, the
  `jobId` and the body `QueueClientSqs` would send. `outbox.relay.test.ts` on `PgClientTest` +
  `AwsClientsMiniStack` with a provisioned `buildStage()` stage: a pending row reaches its SQS
  queue with its `jobId` attribute and is deleted; two relays over one database publish five rows
  once each; a transport whose `send` fails keeps the rows and the next poll publishes them once
  it answers; under `TestClock`, an empty poll waits `outboxPollInterval`. Seam 8 —
  `apps/worker/src/layer.test.ts` builds `WorkerLayer` over `PgClientTest` and MiniStack.
- **Verify:** `make check`; `make up`, `make dev-worker`, a row inserted into `outbox` by `psql`
  with a valid job body reaches its queue within a second and the row is gone.
- **Status:** todo

#### S11 — The outbox in the send

- **Goal:** jobs are written in the send's transaction. `apps/api` provides `QueueClientOutbox`
  in place of `QueueClientSqs`; the harnesses (`chat.harness.ts`, `api.harness.ts`) provide
  `QueueClientOutbox` and read `outbox` rows in place of `recordQueue`, which stays in
  `packages/queue/testing` for suites without a database. `use-cases.md` replaces "Enqueue after
  the writes the job reads" with the outbox rule (R5, R6; D4).
- **Blocked by:** S9, S10.
- **Files:** `apps/api/src/layer.ts`, `apps/api/package.json`,
  `application/testing/chat.harness.ts`, `apps/api/src/testing/api.harness.ts`,
  `application/chat/send-message.use-case.test.ts`, `apps/api/src/chat/chat.handler.test.ts`,
  `.claude/rules/use-cases.md`, `docs/knowledge/aws.md` (Queues: the api never sends to SQS),
  `docs/knowledge/database.md` (the send and the outbox).
- **Test first:** Seam 5 — `send` leaves one outbox row (two when the message opens the chat) in
  the same transaction as the messages, with the bodies the jobs decode; the failing insert of S9
  leaves the outbox empty. Seam 7 — a `202` leaves its outbox rows.
- **Verify:** `make check`; `make up`, `make dev`, one send: `psql` shows the two outbox rows
  gone within a second and the worker log shows the reply job; with the worker stopped the rows
  stay; `git grep -n recordQueue -- application apps` is empty.
- **Status:** todo

#### S12 — Read models as relational queries

- **Goal:** `MessageDetail`, `ChatSummary` and `ChatDetail` move from `application` to
  `domain/chat/chat.model.ts`; `ChatRepository` gains `selectSummaries(userId)` (most recently
  updated first, each with its active message) and `selectDetail(id)` (messages in creation order,
  each with its attachments) and loses `selectByUser`; `ChatRepositoryPg` answers each with one
  `db.query` over the relations of S4 and decodes the nested rows with the entity codecs;
  `ChatService.list` and `get` become one port call each (D6). `Message.attachmentIds` leaves the
  domain (D17): `MessageDetail` carries the attachments, read through the relation in upload
  order; the assistant job reads its history (completed messages with their attachments) in one
  relational query; `DeleteChatUseCase` takes the chat's attachment ids by `message_id`;
  `AttachmentRepository.selectByIds` and the `attachmentIds` omit in `http-api` go. Also from the
  key-value era: `findSendable` asks whether the chat has a message with `exists` instead of
  reading them all; `byLatestUpdate` and its test go, since the query orders the summaries; the
  active message in `selectSummaries` takes the object filter of `selectActiveByChat` (D18); the
  `selectByChat` comment says creation order, not insertion order.
- **Blocked by:** S6 (and, to avoid merge work in `chat.service.ts`, run after S9).
- **Files:** `domain/chat/{chat.model.ts,chat.model.test.ts,chat.service.ts,index.ts}`,
  `infrastructure/chat/{chat.repository.ts,chat.repository.test.ts}`,
  `application/chat/{chat.service.ts,chat.service.test.ts,index.ts,assistant-message.job.ts,delete-chat.use-case.ts}`,
  `domain/attachment/attachment.service.ts` (`selectByIds` goes), `http-api/chat/chat.http.ts`,
  `infrastructure/attachment/attachment.repository.ts`, `apps/api/src/chat/chat.handler.ts`
  (imports only), `docs/knowledge/database.md` (relational reads), `docs/knowledge/architecture.md`
  ("Where things live": read models in `domain`).
- **Test first:** Seam 3 — `selectSummaries` returns the user's chats most recently updated first,
  each with its active message or `none`, and none of another user's; `selectDetail` returns the
  messages in creation order, each with its attachments in upload order, and `none` for an
  unknown chat. Seam 5 — `ChatService.list` and `get` return the same shapes as before.
- **Verify:** `make check`; `git grep -n selectByUser` is empty; `curl /openapi.json` unchanged
  against the S6 copy.
- **Status:** todo

#### S13 — The dead-letter consumers

- **Goal:** stuck replies are settled. `infrastructure/chat/chat.queue.ts` gains
  `assistantMessageDeadLetterQueue` and `chatTitleDeadLetterQueue` (`name:
  buildDeadLetterName(<queue>.name)`, the job's schema and `jobId`, `maxAttempts:
  Number.MAX_SAFE_INTEGER`, a capped doubling `retryDelay` with a 5-minute ceiling).
  `AssistantMessageJob.deadLetterWorker`: `selectById`; if active, `failMessage(ReplyFailed,
  cause 'dead-lettered after <attempts> attempts on <queue>')`, `update(failed, { from:
  active.stage })`, `touch`; else the existing logs `assistant reply skipped: already settled` or
  `assistant reply skipped: chat deleted`. `ChatTitleJob.deadLetterWorker` logs `chat title
  dead-lettered` (as `queue message dead-lettered` in `packages/queue`). `apps/worker` runs the
  four workers (R13; D8).
- **Blocked by:** S7, S10.
- **Files:** `infrastructure/chat/chat.queue.ts`,
  `application/chat/{assistant-message.job.ts,assistant-message.job.test.ts,chat-title.job.ts,chat-title.job.test.ts}`,
  `apps/worker/src/{layer.ts,layer.test.ts}`, `docs/knowledge/aws.md` (Queues: the dead-letter
  consumers; the "A reply stays active" sentence names the consumer), `docs/knowledge/database.md`
  (stuck replies).
- **Test first:** Seam 6 — a `GenerateAssistantMessage` handled by the dead-letter handler with
  `attempt: 4` sets the active message `failed` with `ReplyFailed` and a cause naming the
  dead-letter queue and the attempts, and moves the chat's `updated_at`; a terminal message and a
  deleted chat are logged and untouched; a `GenerateChatTitle` from its dead-letter queue is logged
  only. Seam 8 — `WorkerLayer` builds with the four workers.
- **Verify:** `make check`; live: `make up`, `make dev-api`, send with the worker stopped, redrive
  the job by receiving it `maxReceiveCount` times with `aws sqs receive-message --visibility-timeout
  0`, start the worker: the message is `failed` within seconds and the log names the dead-letter
  queue.
- **Status:** todo

## Requirement coverage

| Req | Steps |
|---|---|
| R1 | S5, S6 |
| R2 | S6, S12 |
| R3 | S2, S4 |
| R4 | S2, S4, S5 |
| R5 | S11 |
| R6 | S9, S11 |
| R7 | S10 |
| R8 | S10 |
| R9 | S7, S9 |
| R10 | S8, S9 |
| R11 | S8, S9 |
| R12 | S7 |
| R13 | S13 |
| R14 | S1, S2 |
| R15 | S1, S3, S6 |
| R16 | S3 |
| R17 | S3 |
| R18 | S3 |
| R19 | S1, S6 |
| R20 | S1, S6 |
| R21 | S6, S9, S10, S11, S13 |
| R22 | S1, S2, S3, S6, S9, S10, S11, S12, S13 |
