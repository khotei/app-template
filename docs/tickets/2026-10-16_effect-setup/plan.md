# Effect setup — plan

> Ticket: `2026-10-16_effect-setup` · Requirements: [feature.md](./feature.md) · Design: [architecture.md](./architecture.md)

## How to run this plan

- **Branch and commits.** Work happens on `chore/effect-setup`, with one commit per step through
  `/ticket-implement`, made only after the user's OK. Before committing, set the step's `Status:`
  to `done`. Commits follow `.claude/rules/commits.md`, with the scope `effect-setup`.
- **Green at every commit.** Each step leaves `make check` green, because from S6 on `pre-commit`
  runs `bun check` and `tsc -b`, and `--no-verify` is banned. The layer gates of R2 fall on S7,
  S19 and S22.
- **Size.** A step changes ≤ ~400 lines, counted as R3 says: without `repos/`, `bun.lock` and the
  generated `openapi.json`, and S1, which holds only the ticket's documents, is exempt. A step that
  grows past this splits into `Sna`, `Snb`.
- **Versions.** S2 re-checks every pin with `bun info <pkg> version`. A newer stable version is
  pinned, `feature.md › Context` is updated, and S4 vendors that tag.
- **Until the `claude` layer lands**, the ticket's documents override older guidance:
  - `architecture.md › Contracts` and this plan win over the layer `CLAUDE.md` files, `naming.md`
    and `docs/knowledge/architecture.md`;
  - from S8 on, read `repos/effect/LLMS.md` before writing Effect code, and verify every API
    against `repos/effect`, not against memory;
  - steps S5 and S6 change commands, so each fixes the lines in `.claude/rules/tooling.md` and
    `docs/knowledge/tooling.md` that it makes false. Conventions are rewritten in S20–S22.
- **Tests only at the Seams** of `architecture.md`. A step whose behaviour is observed at a later
  step's seam says `config only` and names that seam.
- **Deviations** are recorded in the step's findings, in `architecture.md › Decisions` when they
  are decisions, and in `feature.md` when they change what a requirement asks.
- **Wrap-up is not a layer.** S23 changes no code; it runs `/ticket-verify`, which writes
  `verification.md`, and opens the PR.
- **Open checks V1–V6** (`feature.md`, `architecture.md`) are settled in the step that names them.
  Each one's outcome is recorded in that step's findings.

## Steps

### Layer 1 — `setup`

#### S1 — Commit the ticket docs

- **Goal:** the ticket's documents are tracked first (R1).
- **Blocked by:** none.
- **Files:** `docs/tickets/2026-10-16_effect-setup/{architecture,plan}.md`, and the amendments to
  `feature.md`.
- **Test first:** config only.
- **Verify:** `make check`; `git show --stat HEAD` lists only the ticket folder.
- **Status:** done
- **Findings:** the two review passes reshaped the design before the commit: use cases became
  methods of `ExampleService`, the job became `ExampleSummaryJob` with `enqueue` and `worker`
  (D2, D16, D17), and R1, R3, R20 were amended for the docs-only step, the subtree commits and
  adapters that are values or functions.

#### S2 — Catalogs and the Effect language service

- **Goal:**
  - the `effect`, `typescript` and `tools` catalogs pinned exactly (R4);
  - `@effect/tsgo` scaffolded by `effect-tsgo setup` and then trimmed (R6);
  - the plugin in `tsconfig.base.json`, and `prepare` = `husky && effect-tsgo patch` (R7);
  - `bun check` unchanged (R9).
- **Blocked by:** S1.
- **Files:**
  - root `package.json`: `catalogs.effect`; `catalogs.typescript` (`typescript` moves out of
    `runtime`); `catalogs.tools` gains `vitest`; root `devDependencies`; `prepare`;
  - `tsconfig.base.json`;
  - `bun.lock`.
- **Test first:** config only.
- **Verify:**
  - `bun install`;
  - `node_modules/.bin/tsc --version` contains `effect-tsgo`;
  - `grep -E '"[\^~]' package.json` finds nothing, and `bun info` matches every pin;
  - `make check`.
- **Status:** todo

#### S3 — Exclude `repos/` and add `make vendor-effect`

- **Goal:** everything ignores `repos/` before it exists, and one target vendors the pinned tag
  (R10, R11, D13).
- **Blocked by:** S1.
- **Files:**
  - `biome.json` (`!repos`);
  - `Makefile` (`vendor-effect`: a shallow fetch of the tag, then `git subtree add|merge --squash
    --prefix repos/effect`; `ids` excludes `repos/`);
  - `.github/workflows/ci.yml` (lychee excludes `repos/`).
- **Test first:** config only.
- **Verify:**
  - with a scratch `repos/x/bad.ts` (lint errors, a ticket id), `make check` stays green; remove it
    afterwards;
  - `make help` lists `vendor-effect`.
- **Status:** todo

#### S4 — Vendor the Effect source

- **Goal:** `repos/effect` is a squashed subtree at `effect@<pinned>` (R3, R10).
- **Blocked by:** S2, S3.
- **Files:** `repos/effect/**`, written by `make vendor-effect` on a clean tree after the user's OK.
  `git subtree` writes the squash commit and the merge commit itself (R1); the merge message is
  given with `-m` in the `commits.md` format. This step's `Status:` is set in the next step's commit.
- **Test first:** config only.
- **Verify:**
  - `repos/effect/packages/effect/package.json` `version` equals the catalog pin;
  - `repos/effect/LLMS.md` exists;
  - `make check`;
  - **V1:** `git push --dry-run` succeeds with `.git/shallow` present (only after the user's OK
    to touch the remote; otherwise this moves to S23).
- **Status:** todo

#### S5 — vitest 5 on Bun replaces `bun:test`

- **Goal:**
  - one root `vitest.config.ts` with a project per root workspace, excluding `repos/**` (R11, R12,
    D9);
  - any failure exits non-zero (R13);
  - no `bun:test` import left (R14);
  - `pre-push` and CI test through vitest (R16).
- **Blocked by:** S2.
- **Files:**
  - `vitest.config.ts`;
  - root `package.json`: `test` = `bun --bun vitest run`, and the `vitest` devDependency;
  - `Makefile` (`test` = `bun run test`);
  - `.husky/pre-push` (`make test`);
  - `ci.yml` (test job runs `bun run test`);
  - `.claude/settings.json`: deny `bun test`;
  - the five existing `*.test.ts` files: imports from `vitest`, `mock` → `vi.fn`;
  - the false lines in `.claude/rules/tooling.md` and `docs/knowledge/tooling.md`.
- **Test first:** config only. The red check is R13: a deliberately failing test.
- **Verify:**
  - `make test` runs every workspace's tests;
  - a failing test in `domain` and then in `apps/api` each makes `make test` exit 1;
  - `mv .env .env.bak && make test` passes;
  - `git grep "bun:test"` finds nothing;
  - **V3:** decide whether `test` forces `--reporter=default` under `CLAUDECODE`;
  - **V6:** projects come from the `workspaces` globs, with no per-directory config.
- **Status:** todo

#### S6 — The patched `tsc -b` gate

- **Goal:** `make check`, `pre-commit` and CI fail on Effect diagnostics, with `bun check` kept
  beside `tsc -b` (R8, R9, R16, D8).
- **Blocked by:** S2, S4.
- **Files:**
  - `Makefile` (`typecheck` = `bun check && tsc -b`);
  - `.husky/pre-commit` (adds `tsc -b`);
  - `ci.yml` (`static` adds `tsc --version | grep effect-tsgo` and `tsc -b`);
  - the false lines in `.claude/rules/tooling.md` and `docs/knowledge/tooling.md`.
- **Test first:** config only. The floating-Effect probe needs Effect code and runs in S8.
- **Verify:**
  - `make check`;
  - **V2:** `tsc -b` walks the references, and `git status` shows no emitted file;
  - `tsc -b --verbose` lists no project under `repos/` (R11).
- **Status:** todo

#### S7 — Biome bans for Effect

- **Goal:**
  - v3 packages are banned, and each message names the v4 replacement (R5);
  - `domain` may import only `effect` (R17);
  - web client code may import no `effect` or `@effect/*` (R33);
  - imports from `repos/` fail (R11).
- **Blocked by:** S1.
- **Files:** `biome.json`.
- **Test first:** config only. Probe edits are the red check.
- **Verify:**
  - `make lint` fails, naming the replacement, for each of these probe edits, each then reverted:
    - `@effect/platform` in `application/`;
    - `@effect/platform-bun` or `@oblik/config` in `domain/`;
    - `effect` in `apps/web/src/features/`;
    - `../../repos/effect/…`;
  - `make check` is green. This is the **`setup` layer gate**.
- **Status:** todo

### Layer 2 — `modules`

#### S8 — The queue port on `PersistedQueue`

- **Goal:** `packages/queue` offers `JobQueue { send, consume }`, `QueueClient`, `QueueError`,
  `QueueClientMemory` and `createQueueClientSqlite` (R23, D1). `consume`:
  - logs each failed attempt and the final dead-letter (R28, D11);
  - never stops on a failure;
  - releases an in-flight message on interrupt without counting the attempt (R29).
- **Blocked by:** S5, S6.
- **Files:**
  - `packages/queue/{queue,memory,sqlite,index}.ts` and `queue.test.ts`; `client.ts` is removed
    (it has no importer);
  - `packages/queue/package.json`: `effect`, `@effect/sql-sqlite-bun`, `@effect/vitest`, and
    `exports`.
- **Test first:** seam **`JobQueue` suite**, run against memory and against SQLite on a temp file:
  - send and consume;
  - a repeated id is delivered once;
  - a message survives a rebuilt layer on the same file;
  - the loop continues after a failure.
  Retries on the schedule, dead-lettering and the interrupt release are observed at the
  `ExampleSummaryJob` seam in S13, under `TestClock` (D10).
- **Verify:**
  - `make check`;
  - **R8 probe:** a bare `Effect.log('x')` statement in `queue.ts` fails `make typecheck`
    (`tsc -b`) while `bun check` passes. Then revert it.
- **Status:** todo

#### S9 — Config as services

- **Goal:**
  - `ApiConfig`, `WebConfig`, `RuntimeConfig` and `QueueConfig` (R29a), with `createConfigLayer`
    giving one `ConfigInvalidError` that names every bad variable (R21, D7);
  - `MinimumLogLevelFromConfig`;
  - tests on a replacement `ConfigProvider` (R15);
  - `.env.example` and `.gitignore` for the queue file (R22).
- **Blocked by:** S5.
- **Files:**
  - `packages/config/{config,layer,index}.ts` and `layer.test.ts`;
  - the legacy `Config` and `ConfigError` move into `load.ts`, which stays until S19 removes it
    with its last importer;
  - `packages/config/package.json`;
  - `.env.example` (`QUEUE_SQLITE_PATH`, `QUEUE_LOCK_*`, `LOG_LEVEL`);
  - `.gitignore` (`.data/`).
- **Test first:** seam **`createConfigLayer`**:
  - missing `API_PORT` and `QUEUE_SQLITE_PATH` give one error naming both;
  - the defaults apply;
  - the `LOG_LEVEL` literals are accepted.
- **Verify:**
  - `make check`;
  - **V5:** whether `Config.LogLevel` accepts lower case, settling the `.env.example` value.
- **Status:** todo

#### S10 — Retire the plain code above `domain`

- **Goal:** remove what the bottom-up rewrite would break, so later steps write only final code
  (D15).
- **Blocked by:** S5.
- **Files:**
  - remove `application/example/create.use-case{,.test}.ts`;
  - remove `infrastructure/example/example.{queue,llm,storage}.ts`, and update the barrel;
  - remove `apps/worker/src/handlers/`; `layer.ts` and `main.ts` shrink to a process that starts
    and idles;
  - remove the example routes from `apps/api/src/{http,layer}.ts` and their cases from
    `http.test.ts`, keeping `/health`;
  - edit the `index.ts` barrels.
- **Test first:** config only (removal only; the remaining `/health` test stays green).
- **Verify:**
  - `make check`;
  - `git grep -nE "createExample(UseCase|Handler|Queue|Llm|Storage)|exampleJobType"` finds nothing.
- **Status:** todo

#### S11 — `domain` on Schema, the memory repository, `ExampleService`

- **Goal:**
  - `ExampleId`, `Example`, the `Schema.TaggedError` errors, the `ExampleRepository` port with no
    layer, and an Effectful `buildExample` (R18, D6);
  - `domain` reads no ambient time or randomness (R19) and declares only `effect` (R17);
  - `ExampleRepositoryMemory` (R20);
  - `ExampleService` with `get`; `create` arrives in S14 (D17).
- **Blocked by:** S10.
- **Files:**
  - `domain/example/example.{model,error,service}.ts` and `example.service.test.ts`; remove
    `domain/shared/`;
  - `domain/package.json`;
  - `infrastructure/example/example.repository.ts`;
  - `application/example/example.service{,.test}.ts`;
  - the `package.json` files of `infrastructure` and `application`.
- **Test first:**
  - seam **`buildExample`**: the name is trimmed, a blank name gives `ExampleNameInvalidError`,
    and the id and time pass through;
  - seam **`ExampleService.layer`** over `ExampleRepositoryMemory`: an example upserted through the
    repository is returned by `get`; an unknown id gives `ExampleNotFoundError`.
- **Verify:**
  - `make check`;
  - `git grep -E "Date.now|new Date\(|randomUUID" domain/` finds nothing.
- **Status:** todo

#### S12 — Stub clients as layers, and the SQLite queue client

- **Goal:**
  - `LanguageModelStub` (R20);
  - `DbClient` and `StorageClient` with `*Memory` layers;
  - `buildExampleObjectKey`, and `OutboxMessage` as a `Schema.Struct`;
  - `QueueClientSqlite`, where `QueueConfig` turns into client options (R23, R29a).
- **Blocked by:** S8, S9, S11.
- **Files:**
  - `packages/{llm,db,storage}/client.ts` and their `package.json` files;
  - `infrastructure/example/{example.storage,index}.ts`;
  - `infrastructure/shared/{outbox.repository,queue.client,index}.ts`;
  - `infrastructure/package.json`.
- **Test first:** config only. `QueueClientSqlite` and `LanguageModelStub` have no seam: the
  `ExampleSummaryJob` seam runs on memory and a recording model (D10), so S18 checks them by hand.
- **Verify:** `make check`.
- **Status:** todo

#### S13 — `ExampleSummaryJob`: enqueue, worker, handle

- **Goal:**
  - `SummarizeExample` and the definition value `exampleSummaryQueue` carry the name, schema and
    retry policy (R24, D17);
  - `examplePrompt` and the function `summarizeExample` (D14, D17);
  - `example-summary.job.ts` holds `ExampleSummaryJob.enqueue`, `ExampleSummaryJob.layer`,
    `ExampleSummaryJob.worker` and the module's `handle` (R25, D2);
  - the job calls `LanguageModel` and logs the result (R27);
  - retries, dead-lettering and interrupts follow `consume` (R28, R29, D10).
- **Blocked by:** S11, S12.
- **Files:**
  - `infrastructure/example/{example.queue,example.prompt,example.llm,index}.ts`;
  - `application/example/example-summary.job{,.test}.ts` and the barrel;
  - the `package.json` files where needed.
- **Test first:** seam **`ExampleSummaryJob.layer` + `ExampleSummaryJob.worker`** over
  `QueueClientMemory` and `TestClock`:
  - an enqueued job reaches a recording `LanguageModel`, with the prompt;
  - a failing model is retried on the schedule;
  - after `maxAttempts` the job is dead-lettered and logged;
  - an interrupt releases the job without counting the attempt.
- **Verify:** `make check`.
- **Status:** todo

#### S14 — `ExampleService.create`

- **Goal:** `ExampleService.create` builds, saves and enqueues once, and `ExampleService.layer`
  bundles `ExampleSummaryJob.layer`, leaving open only `ExampleRepository`, `QueueClient` and
  `Crypto` (D16):
  - time comes from `Clock`, and the UUIDv7 from `Crypto` (R19);
  - the job id is `example-summary:<id>`, and a repeated send is deduplicated (R26);
  - no requirement leaks from `create`.
- **Blocked by:** S13.
- **Files:** `application/example/example.service{,.test}.ts`.
- **Test first:** seam **`ExampleService.layer`** over `ExampleRepositoryMemory`,
  `QueueClientMemory`, `TestClock` and a fresh `TestCrypto.layer(seed)` per test:
  - deterministic id and `createdAt`;
  - one job, with id `example-summary:<id>`, and a second `enqueue` of the same example is
    deduplicated;
  - a blank name saves and enqueues nothing.
- **Verify:** `make check`.
- **Status:** todo

#### S15 — `@oblik/api-contract` and `openapi.json`

- **Goal:**
  - the `HttpApi` holds its own DTOs, and errors as arrays carrying their statuses, importing
    only `effect` (R30, D3);
  - `RequestValidation` is applied last, with all-errors parsing (D5);
  - `openapi.json` is generated and committed, and checked for drift (R32).
- **Blocked by:** S5.
- **Files:**
  - `packages/api-contract/{api,example,health,validation,index,openapi}.ts`, `openapi.json` and
    `openapi.test.ts`;
  - `package.json` and `tsconfig.json`, by the new-workspace checklist;
  - the root `tsconfig.json` references;
  - `Makefile` (`openapi`).
- **Test first:** seam **`openapi.test.ts`**. It is red before `make openapi` writes the file;
  the committed spec documents the 400 and the 500.
- **Verify:**
  - `make check`;
  - an endpoint edited without regenerating fails `make check`;
  - **V4** starts here: how the 500 enters every error union.
- **Status:** todo

#### S16 — `@oblik/api-client` as a `Promise<Result>` facade

- **Goal:** `createApiClient(baseUrl, { fetch })` is derived from the contract by one mapped
  type, and its calls never reject (R33, D4). `apps/web` uses it without importing `effect`.
- **Blocked by:** S15.
- **Files:**
  - `packages/api-client/{client,result,index}.ts`, `client.test.ts` and a type test;
  - `packages/api-client/package.json`;
  - `apps/web/src/{shared/api.ts,features/example/health-panel.ts}`.
- **Test first:** seam **`createApiClient` over a fake `fetch`**:
  - a refused connection gives the transport error;
  - a wrong body or status gives `SchemaError` or `DecodeError`;
  - no call rejects;
  - a `switch` over `error._tag` that misses a case fails the typecheck.
- **Verify:**
  - `make check`;
  - **V4** settled: an empty 500 decodes to `InternalServerError`.
- **Status:** todo

#### S17 — `apps/api` on `HttpApiBuilder`

- **Goal:**
  - the contract is implemented, with domain errors mapped to contract errors and `QueueError`
    turned into a 500 (R31, D5);
  - `ApiHttp` is served by `BunHttpServer` under `BunRuntime.runMain`;
  - logs go through `Effect.log` at `LOG_LEVEL`, and finalizers run on signals (R35);
  - dev and debug run with `--watch` (R36, D12);
  - `POST /examples` enqueues the job (R26);
  - `ExampleHandlers` bundles `ExampleService.layer`; the root provides only the leaves (D16).
- **Blocked by:** S9, S14, S16.
- **Files:**
  - `apps/api/src/{http,validation,layer,main}.ts` and `http.test.ts`;
  - `apps/api/package.json` (dependencies, `--watch`);
  - `Makefile` (the help text of `dev-api` and `debug-api`).
- **Test first:** seam **`HttpRouter.toWebHandler(ApiHttp)`**, driven by
  `createApiClient(url, { fetch })` and raw `Request`s:
  - 201, 404, 422 and a 400 listing every issue, each with a typed `Result`;
  - a defect gives a 500, and so does a response that fails to encode (R31);
  - `POST /examples` enqueues on the memory queue.
- **Verify:**
  - `make check`;
  - `make dev-api` and `curl` give a JSON 201;
  - SIGTERM logs the finalizers.
- **Status:** todo

#### S18 — `apps/worker` launches `ExampleSummaryJob.worker`

- **Goal:**
  - the worker only launches `ExampleSummaryJob.worker` (R25);
  - jobs cross processes through the SQLite file (R27);
  - signals release in-flight jobs (R29, R35);
  - `--watch` restarts leave one consumer (R36).
- **Blocked by:** S9, S12, S13, S17 (the process check posts through the api).
- **Files:** `apps/worker/src/{layer,main}.ts` and `apps/worker/package.json`.
- **Test first:** config only. The behaviour sits at the `ExampleSummaryJob` seam (S13); the
  process is checked by hand.
- **Verify:**
  - `make check`;
  - with the worker stopped, three `POST /examples`; then `make dev-worker` logs three results;
  - SIGTERM during a job leaves it at the same attempt for the next worker;
  - editing a file restarts it with one consumer.
- **Status:** todo

#### S19 — Web server entry on the config layer; `load.ts` removed

- **Goal:** `apps/web/src/main.ts` stays `Bun.serve` with HMR and reads `WebConfig` through
  `createConfigLayer` (R34). The last importer of `loadConfig` is gone, so `load.ts` and its test
  go too (R21).
- **Blocked by:** S16, S17, S18.
- **Files:**
  - `apps/web/src/main.ts`;
  - `packages/config/{load,load.test,index}.ts`;
  - `apps/web/package.json`.
- **Test first:** config only. `createConfigLayer` is already covered at its S9 seam.
- **Verify:**
  - `make dev-web` keeps HMR;
  - `git grep loadConfig` finds nothing outside the docs;
  - `make check` is green. This is the **`modules` layer gate**.
- **Status:** todo

### Layer 3 — `claude`

#### S20 — `effect.md`, the rule and the knowledge doc

- **Goal:**
  - `.claude/rules/effect.md` (`paths: **/*.ts`, ≤ ~80 lines) covers (R37, R37a, R37b):
    - v3 memory is wrong; read `repos/effect`, `LLMS.md` first;
    - the order in which a capability is sourced, and the layer limits;
    - core data primitives;
    - the project's choices;
  - `docs/knowledge/effect.md` covers the R38 topics: services and layers, errors, config, the
    contract and client, jobs and SQS, testing, the gate, the vendored source, and why the
    capability order of R37a is what it is;
  - the client bundle size is measured and recorded;
  - every line elsewhere that restates either document is trimmed.
- **Blocked by:** S19.
- **Files:** `.claude/rules/effect.md`, `docs/knowledge/effect.md`, and the trimmed lines.
- **Test first:** config only.
- **Verify:**
  - the rule is ≤ ~80 lines;
  - each R38 topic has a section, and `effect.md` explains the R37a order;
  - no Cyrillic (R40);
  - `make check`.
- **Status:** todo

#### S21 — Conventions: naming, tooling and the layer `CLAUDE.md` files

- **Goal:** `naming.md` states every R39 bullet; `tooling.md` and the five layer `CLAUDE.md`
  files carry the Effect conventions; none restates `effect.md` (R39).
- **Blocked by:** S20.
- **Files:**
  - `.claude/rules/{naming,tooling}.md`;
  - `{domain,infrastructure,application,packages,apps}/CLAUDE.md`.
- **Test first:** config only.
- **Verify:**
  - each `CLAUDE.md` is ≤ ~40 lines and each rule ≤ ~80;
  - `git grep -nE "DomainError|loadConfig|createLayer|createExampleService|ExampleJob\b|exampleJobType|Id<'|\.handler|use-case"` in `.claude/` and the
    `CLAUDE.md` files finds nothing;
  - `make check`.
- **Status:** todo

#### S22 — Knowledge docs and README

- **Goal:**
  - `docs/knowledge/tooling.md` covers the commands, gates, LazyVim (the `tsc` LSP) and
    troubleshooting, including a lost patch;
  - `docs/knowledge/architecture.md` replaces "The Effect seam" with how layers compose, and
    updates "Where things live" and "Add a new entity";
  - `README.md` links `effect.md` (R38, R40).
- **Blocked by:** S20.
- **Files:** `docs/knowledge/{tooling,architecture}.md`, `README.md`, and the link to
  `#the-effect-seam` in this ticket's `feature.md › Context`, pointed at the new section.
- **Test first:** config only.
- **Verify:**
  - lychee (CI `docs`) passes offline;
  - `make check` is green. This is the **`claude` layer gate**.
- **Status:** todo

### Wrap-up

#### S23 — Verify, PR, merge

- **Goal:**
  - `/ticket-verify` gives a verdict per requirement, including the manual checks of
    `architecture.md › Seams`;
  - one squash-merged PR, and the branch is kept (R1);
  - the PR body carries `git-subtree-dir:` and `git-subtree-split:` outside its HTML comment (R10).
- **Blocked by:** S21, S22.
- **Files:** `verification.md` (written by `/ticket-verify`); the PR body.
- **Test first:** config only.
- **Verify:** pushing, opening the PR and merging each need the user's OK. **V1** is checked here
  if S4 did not. `git log main -1` carries the subtree trailers.
- **Status:** todo

## Requirement coverage

| Req | Steps | Req | Steps |
|---|---|---|---|
| R1 | S1, S4, S23 | R21 | S9, S19 |
| R2 | gates S7, S19, S22 | R22 | S9 |
| R3 | every step; S4 | R23 | S8, S12 |
| R4 | S2 | R24 | S13 |
| R5 | S7 | R25 | S13, S14, S17, S18 |
| R6 | S2 | R26 | S14, S17 |
| R7 | S2 | R27 | S13, S18 |
| R8 | S6, S8 (probe) | R28 | S8, S13 |
| R9 | S2, S6 | R29 | S8, S13, S18 |
| R10 | S3, S4, S23 | R29a | S9, S12 |
| R11 | S3, S5, S6, S7 | R30 | S15 |
| R12 | S5 | R31 | S17 |
| R13 | S5 | R32 | S15 |
| R14 | S5, S8, S9, S11, S13–S17 | R33 | S7, S16 |
| R15 | S9 | R34 | S19 |
| R16 | S5, S6 | R35 | S17, S18 |
| R17 | S7, S11 | R36 | S17, S18 |
| R18 | S11 | R37, R37a, R37b | S20 |
| R19 | S11, S14 | R38 | S20, S22 |
| R20 | S11, S12 | R39 | S21 |
| | | R40 | S20–S22 |
