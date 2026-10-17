# Effect setup

> **Superseded at S12.** What remains is re-homed in the [roadmap](../../knowledge/roadmap.md#re-homing-effect-setup).

> Ticket: `2026-10-16_effect-setup` · Source: conversation
> Related: [architecture.md](./architecture.md) · [plan.md](./plan.md)

## Goal

Adopt Effect v4 across the Oblik+ scaffold the way the previous ticket set up the monorepo: every
tool installed by its own init command and adapted, every layer of the `example` slice rewritten on
Effect primitives with tests on Effect's test tooling, and rules that make Claude write idiomatic
Effect v4 instead of v3 from memory.

The slice has to demonstrate the target architecture end to end: the web app calls the api through
a client generated from the api's own contract; the api enqueues a job; the worker takes the job
and runs it, calling a language model. Today every external service is in-memory or a
stub; Postgres, S3, SQS and a real LLM provider each replace one `Layer` in a later ticket.

The ticket stays a worked example: a future project reads `chore/effect-setup` step by step.

## Context

- **Starting point.** `main` at `1bbdd1a` (the squashed `monorepo-setup`): plain TypeScript layers
  shaped for Effect ([architecture.md › The Effect seam](../../knowledge/architecture.md#the-effect-seam)),
  `bun:test`, `bun check`, Biome layer guards, husky hooks, CI.
- **Product direction**, for intent only: the api accepts requests and enqueues jobs; the worker runs
  background jobs such as LLM agents analysing documents; the web app consumes a typed api client.
  No product entity is built here.
- **Donor.** [`khotei/kotodama-core`](https://github.com/khotei/kotodama-core) is a source of ideas,
  not a template. It pins `effect@4.0.0-beta.78` and uses paths and names that stable v4 removed
  (`effect/unstable/*`, `Schema.TaggedErrorClass`), plus house rules that contradict upstream
  (`Effect.fn` banned, `*Live` layers, services minimised). Kept: one exact lock-step catalog for
  Effect, "verify against the installed source, your v3 memory is wrong", `Context.Reference` for
  knobs, a replacement `ConfigProvider` in tests, endpoint errors as an array.
- **Facts checked on 2026-10-16** (versions are re-verified at implementation time):

  | Fact | Value |
  |---|---|
  | `effect` and every v4 `@effect/*` | `4.0.5`, released together (one `fixed` changeset group) |
  | v3-only packages | `@effect/platform`, `@effect/schema`, `@effect/sql`, `@effect/ai`, `@effect/rpc`, `@effect/cli`, `@effect/experimental`, `@effect/sql-drizzle` |
  | Former `effect/unstable/*` | now `effect/http`, `effect/http-api`, `effect/sql`, `effect/ai`, `effect/persistence`, …; still `@stability unstable` |
  | `Context.Tag` | gone; ports are `Context.Service` |
  | `@effect/tsgo` | `0.53.2`, embeds TypeScript `7.0.2`; patches the `typescript` binary (`effect-tsgo patch`) |
  | `bun check` | ignores the tsconfig `plugins` option, so it never reports Effect diagnostics |
  | `@effect/vitest` | `4.0.5`, peer `vitest >=5 <6`; fails under `bun test`, works under `bun --bun vitest` (runs on Bun) |
  | `vitest` | `5.0.5` |
  | LazyVim | default TS server `vtsls` cannot load the plugin on TS 7 (no `tsserver.js`); the `tsc` LSP can |
  | Effect LLM guidance | vendor the Effect repo with `git subtree --squash` into `repos/effect`, committed, read `LLMS.md` first |
  | `OpenApi.fromApi` | builds the spec from the `HttpApi` value with no server running; output is deterministic |
  | `PersistedQueue` | `effect/persistence`: at-least-once, retries by `Schedule`, `maxAttempts`, dead-letter, dedup by id; stores `memory`, `sql`, `redis` |
  | `PersistedQueue` over SQLite | api and worker as separate processes share jobs through one file; jobs survive a stopped worker |

## Scope

- Catalogs `effect` and `typescript`, `vitest` in `tools`; `@effect/tsgo` with its diagnostics as a
  gate; the Effect repo vendored at `repos/effect`.
- Every workspace except `deployment` and `packages/ui` rewritten on Effect: `Schema` models and
  errors, `Context.Service` ports with layers, `Effect.fn` services and use cases, `effect/Config`.
- `@oblik/api-contract` (the `HttpApi` definition) with a committed, drift-checked `openapi.json`;
  `@oblik/api-client` built with `HttpApiClient` behind a `Promise` facade.
- The api on `BunHttpServer` and `BunRuntime.runMain`; the worker consuming a queue port.
- A generic queue port in `packages/queue` backed by `PersistedQueue`: in-memory in tests, a SQLite
  file across processes in dev.
- The `llm` package exposing `LanguageModel` from `effect/ai` through a stub layer.
- vitest 5 with `@effect/vitest` replacing `bun:test`, in hooks, `make` and CI.
- `.claude/rules/effect.md`, `docs/knowledge/effect.md`, and edits to the rules, layer `CLAUDE.md`
  files and knowledge docs whose conventions Effect changes.

## Out of scope

- Postgres, Drizzle and `@effect/sql-pg`; domain data stays in-memory.
- AWS: SQS (client, standard vs FIFO, Lambda as an alternative), S3, and an SQS emulator in
  `docker-compose`. `deployment/` stays plain TypeScript.
- A real LLM provider (`@effect/ai-anthropic`, `@effect/ai-openai`) and prompts with files.
- Effect in browser code beyond what `@oblik/api-client` bundles; Effect UI libraries
  (`@effect/atom-react`).
- Publishing `@oblik/api-client` or the contract outside the monorepo.
- Tracing and OpenTelemetry (`effect/observability`); Effect DevTools.
- Multipart upload, SSE progress streams, `effect/workflow` and `effect/cluster`, `effect/rpc`,
  `effect/reactivity`, `effect/cli`: each arrives with the product ticket that needs it.
- Custom GritQL lint rules; the `effect-tsgo` Oxlint integration.
- Changing the user's Neovim config; that happens outside the ticket, on request.
- Oblik+ product entities.

## Requirements

### Git, plan and versions

- **R1** — THE implementation SHALL happen on the single branch `chore/effect-setup` cut from `main`,
  with one commit per `plan.md` step, merged through one squash-merged PR, and the branch kept
  afterwards. `feature.md` is committed before planning; the first step SHALL commit the rest of
  this ticket's documents. The vendoring step is the two commits that `git subtree` writes.
- **R2** — `plan.md` SHALL group its steps into three consecutive layers, `setup`, `modules`,
  `claude`. WHEN the last step of a layer is committed, `make check` SHALL pass at that commit.
- **R3** — A step SHALL change at most ~400 lines, counted without `repos/`, `bun.lock` and
  generated files (`openapi.json`); a step that holds only this ticket's documents is exempt.
  Vendoring `repos/effect` SHALL be a step of its own.
- **R4** — THE root catalogs SHALL hold, pinned exactly to the latest stable versions at
  implementation time:
  - `effect`: `effect`, `@effect/platform-bun`, `@effect/sql-sqlite-bun`, `@effect/vitest`;
  - `typescript` (new, replacing the `runtime` entry): `typescript`, `@effect/tsgo`, which embeds a
    specific TypeScript version;
  - `tools`: `vitest`, constrained by the `@effect/vitest` peer range.
- **R5** — WHEN code imports an Effect v3-only package (`@effect/platform`, `@effect/schema`, …),
  `make typecheck` SHALL fail with TS2307, since none is declared or installed. *Amended in S7: no
  Biome ban, which the first version had; R37 covers verifying APIs against `repos/effect`.*
- **R6** — Each tool SHALL be scaffolded with its own init or setup command where it has one
  (`effect-tsgo setup`), and the result then adapted.

### Language service

- **R7** — THE shared tsconfig SHALL enable the `@effect/language-service` plugin, and the root
  `prepare` script SHALL run `effect-tsgo patch` after `husky`. WHEN `bun install` runs,
  `node_modules/.bin/tsc --version` SHALL report the patched build.
- **R8** — WHEN `make check`, the `pre-commit` hook or CI runs, THE SYSTEM SHALL run the patched
  `tsc -b` over the project references and fail on any Effect error or warning, such as an Effect
  value that is neither yielded nor assigned (architecture D8). *Amended in S8: `unstableApiUsage`
  is an editor-only suggestion, so an unstable module is not a gate failure (D19).*
- **R9** — WHEN `make typecheck`, `pre-commit` or CI typechecks, THE SYSTEM SHALL use the patched
  `tsc -b` only; `bun check` is not a gate, because it ignores tsconfig plugins.

### Vendored Effect source

- **R10** — `repos/effect` SHALL be a `git subtree --squash` of `Effect-TS/effect` at the tag of the
  pinned `effect` version, and a `make` target SHALL pull it to that tag. WHEN the `effect` catalog
  version changes, THE SYSTEM SHALL update `repos/effect` in the same PR (one squash commit on
  `main`; on the branch the bump and the vendoring are separate commits, because `git subtree`
  refuses a tree with uncommitted changes). WHEN that PR is opened, its body SHALL carry the
  `git-subtree-dir:` and `git-subtree-split:` trailers outside its HTML comment, because a squash
  merge drops the subtree's commit metadata and a later `make vendor-effect`
  (`git subtree pull --squash`) on `main` needs them.
- **R11** — `repos/` SHALL be excluded from Biome, vitest, the patched `tsc -b`, lychee and
  `make ids`, and no workspace glob SHALL match it. WHEN code imports from `repos/`, `biome check`
  SHALL fail.

### Testing

- **R12** — WHEN `make test` runs, THE SYSTEM SHALL run every colocated `*.test.ts` in every
  workspace with vitest 5 on the Bun runtime (`bun --bun vitest run`), from one root config.
- **R13** — IF any test fails in any workspace, THEN `make test` SHALL exit non-zero.
- **R14** — Tests of Effect code SHALL use `@effect/vitest` (`it.effect`, `it.layer`), with fakes
  provided as layers and time controlled by `TestClock`. `bun:test` SHALL NOT be imported anywhere.
- **R15** — Tests SHALL NOT depend on a root `.env`: config comes from a replacement
  `ConfigProvider`.
- **R16** — `pre-commit` SHALL run the patched `tsc -b` (through `make typecheck`) and
  `biome check --staged`; `pre-push` SHALL run `make test`. CI SHALL run the same gates.

### Domain and errors

- **R17** — WHEN code in `domain/` imports another workspace or an `@effect/*` package other than
  `@effect/vitest`, `biome check` SHALL fail. *Amended in S7: the rule is a deny-list shared by
  code and tests; a runtime module or third-party package in `domain` is left to review and R19.*
- **R18** — Domain models SHALL be stable `Schema` definitions (`Schema.Class`, not the unstable
  `Model`) with branded ids; domain errors SHALL be `Schema.TaggedError` classes and SHALL carry no
  transport detail (no HTTP status); ports SHALL be `Context.Service` declarations with no layer,
  because a layer is an implementation and implementations live in `infrastructure`.
- **R19** — `domain` SHALL read no ambient time or randomness (`Date.now`, `new Date()`,
  `crypto.randomUUID`). The application SHALL obtain time from `Clock`/`DateTime` and ids as UUIDv7
  from `Crypto`, provided by `@effect/platform-bun` at runtime and by `TestClock` and a seeded
  `TestCrypto` in tests.

### Infrastructure and packages

- **R20** — An adapter that implements a port, or that holds a resource or a varying
  implementation, SHALL be a `Layer` that provides a `Context.Service`; any other adapter SHALL
  be a value or a function with requirements (architecture D17). The repository stays in-memory.
  Objects and rows SHALL be stored through effect's `KeyValueStore` (`effect/persistence`), with
  `layerMemory` now (`prefix` for key namespaces, `toSchemaStore` for typed rows) and real stores
  (`layerSql`, `layerFileSystem`) later, not through a hand-written `storage` or `db` client;
  `llm` exposes `LanguageModel` from `effect/ai` through a stub layer that returns a canned
  response. *Amended in S12: the `storage` and `db` stubs would duplicate `KeyValueStore`
  (architecture D21).*
- **R21** — `@oblik/config` SHALL define settings with `effect/Config`: one `Context.Service` per
  area with a `layer`, read through the current `ConfigProvider` (`fromEnv` by default, so tests
  swap it). WHEN a required variable is missing or fails to decode, THE SYSTEM SHALL fail at
  startup with a `ConfigError` naming that variable. IF `QUEUE_LOCK_REFRESH_INTERVAL` is not
  shorter than `QUEUE_LOCK_EXPIRATION`, THEN THE SYSTEM SHALL fail at startup with
  `QueueLockRefreshIntervalInvalidError` naming both variables and their values. *Amended in S9:
  Effect reports the first offending variable; the earlier "every variable" needed hand-written
  validation. Amended in S12: the cross-field lock rule has its own tagged error, because a
  `ConfigError` carries only a source or schema failure (architecture D20).*
- **R22** — `.env.example` SHALL list every variable the code reads, including the queue's SQLite
  path, and the SQLite file SHALL be gitignored.

### Jobs

- **R23** — `packages/queue` SHALL expose a generic queue port whose typed queues offer `send` and
  `consume`, with layers for in-memory use and for a SQLite file. Producers, the job handler and the
  infrastructure queue SHALL NOT depend on which layer is provided, so an SQS layer later replaces
  only the composition roots' choice.
- **R24** — `infrastructure` SHALL define the `example-summary` queue as a definition value: its
  name, its message `Schema` and its retry policy (`maxAttempts`, `Schedule`).
- **R25** — `application` SHALL own both sides of the job in one file,
  `application/example/example-summary.job.ts`: the service `ExampleSummaryJob` with the method
  `enqueue`, and the layer `ExampleSummaryJob.worker`, which wires the module's `handle` to
  `consume` (architecture D2). The api SHALL reach `enqueue` only through `ExampleService.create`,
  and `apps/worker` SHALL only launch `ExampleSummaryJob.worker`; neither app SHALL hold job logic.
- **R26** — WHEN `POST /examples` succeeds, THE api SHALL enqueue an `example-summary` job whose id
  is derived from the example's id, so a repeated send is deduplicated. The job message SHALL carry
  every field the job needs, because the worker does not share the api's in-memory data.
- **R27** — WHILE the worker runs, WHEN an `example-summary` job is queued, THE worker SHALL run it,
  calling `LanguageModel`, and log the result. WHEN the worker starts after jobs were queued while
  it was stopped, it SHALL process them.
- **R28** — IF the job fails, THEN THE SYSTEM SHALL retry it on the queue's `Schedule` until
  `maxAttempts`, then keep it as dead-lettered and log it.
- **R29** — WHEN the worker receives SIGINT or SIGTERM, including a `--watch` restart, it SHALL stop
  consuming and release in-flight jobs without counting the attempt, and the restarted worker
  SHALL take them back at once. A job's interrupt path SHALL do nothing asynchronous before the
  release, because `--watch` re-executes the process after the synchronous part of the finalizers.
- **R29a** — The queue's lock expiration and lock refresh interval SHALL come from `QueueConfig`,
  with the refresh shorter than the expiration (dev defaults about 15 s and 5 s), so a killed worker's
  job is retried within seconds and a healthy long job is never stolen.

### Api, contract and client

- **R30** — `@oblik/api-contract` SHALL hold the `HttpApi` definition: endpoints, request and
  response schemas of its own (it may not import `domain`), and HTTP errors listed as an array, each
  carrying its status. It SHALL declare every error a client can receive, including the 400 for a
  request that fails decoding, so the spec and the client see it. It SHALL import only `effect` and
  be safe for the browser.
- **R31** — `apps/api` SHALL implement the contract with `HttpApiBuilder`, serve it with
  `BunHttpServer`, and start through `BunRuntime.runMain`. It SHALL map domain errors to the
  contract's HTTP errors. A request that fails decoding SHALL get a 400 whose body is the contract's
  validation error listing every issue (path and message), produced by one schema-error middleware
  on the whole API with all-errors parsing; a failure to encode a response SHALL stay a 500.
- **R32** — WHEN `make check` runs, THE SYSTEM SHALL regenerate `packages/api-contract/openapi.json`
  from the contract without starting a server, and fail if the committed file differs.
- **R33** — `@oblik/api-client` SHALL build its client with `HttpApiClient` from the contract and
  expose functions returning `Promise<Result>`, a union of `{ ok: true, value }` and
  `{ ok: false, error }`, that never reject. `error` SHALL be the union, derived from the contract,
  of the endpoint's declared errors, the 400, the 500 of an unexpected server failure, and transport
  and unexpected-response errors, each discriminated by `_tag`. The `Result` shape exists only in
  JavaScript: on the wire every error keeps its own HTTP status and a typed JSON body. `apps/web`
  client code SHALL NOT import `effect` or `@effect/*`; WHEN it does, `biome check` SHALL fail.
- **R34** — `apps/web/src/main.ts` SHALL stay a `Bun.serve` dev server with HMR and read `WEB_PORT`
  through `@oblik/config`.

### Runtime and dev modes

- **R35** — `api` and `worker` SHALL log through `Effect.log`, with the minimum level taken from
  `LOG_LEVEL`. WHEN they receive SIGINT or SIGTERM, they SHALL run their finalizers and exit.
- **R36** — `api` and `worker` SHALL run in dev with `--watch`, because `bun --hot` re-evaluates
  modules without stopping the previous Effect runtime, so its fibers accumulate. WHILE `make dev-api`
  or `make dev-worker` runs, WHEN a source file changes, the process SHALL restart with one server,
  one consumer and no fibers left from the previous run. `web` keeps `--hot` with HMR (R34), and
  `make debug-<app>` keeps exposing the inspector in each app's reload mode.

### Claude and docs

- **R37** — `.claude/rules/effect.md` (`paths: **/*.ts`, ≤ ~80 lines) SHALL hold only what an agent
  cannot derive: that its Effect v3 knowledge is wrong and the source of truth is `repos/effect`
  (`LLMS.md` first); the project's Effect decisions (domain imports, contract conventions, queue
  port, where job logic lives, which layers bundle); and any deviation from upstream style. The
  style itself is upstream `LLMS.md`, not restated.
- **R37a** — The rule SHALL fix the order in which a capability is sourced: first a module of
  `effect` or an `@effect/*` package (including the Bun platform services such as `FileSystem`,
  `Crypto` and `HttpClient`), then Bun's standard library, then Node built-ins, and a third-party
  package only when none of them covers the need. `docs/knowledge/effect.md` SHALL explain why.
  Layer limits still apply: `domain` uses only `effect`, and browser code uses neither Bun nor Node.
- **R37b** — The rule SHALL require the core primitives of `effect` for all data work: its data
  modules (`Array`, `Record`, `Struct`, `String`, `Number`, `BigInt`, `Boolean`, `Option`,
  `Predicate`, `Order`, `Equivalence`, `Reducer`, `DateTime`, `Duration`, `Match`, …) and `Schema`
  for every shape and validation. Code SHALL use them in place of native methods and hand-written
  helpers, so data flows compose in one style (`pipe(xs, Array.map((x) => f(x)))` rather than
  `xs.map(f)`, `Option` rather than `undefined` checks, `Predicate` rather than `typeof` guards,
  `DateTime` rather than `Date`), following upstream's dual API and its "avoid tacit usage"
  guideline. Before writing any helper, the agent SHALL look for it in `repos/effect`.
- **R38** — `docs/knowledge/effect.md` SHALL explain, for humans: services and layers and where
  they are composed, errors, config, the contract and client with `openapi.json`, jobs and
  how SQS replaces the queue layer, testing, the language service and its gate, and the vendored
  source. `docs/knowledge/tooling.md` SHALL cover the new commands and gates, editor setup with a
  LazyVim note (switch to the `tsc` LSP), and troubleshooting. `architecture.md` SHALL replace "The
  Effect seam" with how the layers compose now. `README.md` SHALL link the new document.
- **R39** — `.claude/rules/tooling.md`, `.claude/rules/naming.md` and the layer `CLAUDE.md` files
  SHALL be updated where Effect changes a convention (test runner, typecheck gates, factory and layer
  naming, file roles), and SHALL NOT restate `effect.md` or the knowledge docs. `naming.md` SHALL
  state:
  - a port is `<Entity><Role>` (`ExampleRepository`), declared in `domain` with no layer;
  - a service identifier is `@oblik/<workspace>/<entity>/<Name>`;
  - an adapter layer is a constant `<Port><Implementation>` (`ExampleRepositoryMemory`,
    `QueueClientSqlite`), never `*Live`;
  - an application service is `<Entity>Service`, a class with `static layer` whose methods are the
    entity's use cases (`ExampleService.create`), each `Effect.fn('<Service>.<method>')`;
  - a queued job is `<Entity><Purpose>Job` with the method `enqueue` and the layer `worker`
    (`ExampleSummaryJob`); its message is a command named after the job (`SummarizeExample`);
  - a `static layer` provides every dependency that has one implementation and leaves open the
    ones that vary (ports, clients, platform services); there is no `layerNoDeps`
    (architecture D16);
  - settings are `<Area>Config` (`ApiConfig`), replacing `loadConfig`;
  - `build` and `ensure` stay the verbs of pure functions;
  - a service exists only when it holds a resource or something varies behind it; otherwise
    `infrastructure` exports a value (`exampleSummaryQueue`) or a function with requirements
    (`summarizeExample`) (architecture D17);
  - contract errors are `<Entity><Problem>` without `Error` (`ExampleNotFound`), because their tag
    travels on the wire; a prompt function is `<entity>Prompt`, an exception to verb-first;
  - the `.handler` and `.use-case` roles are removed; `.job` holds both sides of a queued job in
    `application`, as `<entity>-<purpose>.job.ts` (`example-summary.job.ts`); `.prompt` holds a
    typed prompt function in `infrastructure`.
- **R40** — All `.claude/`, `docs/` and code content SHALL be in English.

## Acceptance

| Req | How to verify |
|---|---|
| R1–R3 | `git log main..chore/effect-setup` shows `feature.md`, then one commit per step (two for vendoring), the docs first; `make check` passes at the last commit of each layer; `git diff --stat` per step, without `repos/`, `bun.lock` and `openapi.json`, stays near 400 lines, except the docs step. |
| R4, R6 | The catalogs match the registry `latest`; no `^`/`~`; every Effect package is `catalog:effect`. |
| R5 | `import { HttpApi } from '@effect/platform'` in any workspace fails `make typecheck` with TS2307. `.claude/rules/effect.md` sends the agent to `repos/effect`. |
| R7–R9 | After `bun install`, `tsc --version` reports `+effect-tsgo`. A bare `Effect.log('x')` statement, which `bun check` passes, fails `make check`, `pre-commit` and CI; so does a probe with the rule lowered to `warning`. No gate runs `bun check`. |
| R10–R11 | `repos/effect/packages/effect/package.json` version equals the pinned one, and a PR that bumps the `effect` catalog also holds the vendoring commits. `make check` ignores `repos/`. `import … from '../../repos/effect/…'` fails `make lint`. |
| R12–R15 | `mv .env .env.bak && make test` passes. A failing test in each workspace makes `make test` exit non-zero (checked from S8 with `it.effect`). `git grep "from 'bun:test'" -- ':!docs/tickets'` finds nothing. |
| R16 | A commit with a floating Effect is rejected; a push with a failing test is rejected. |
| R17–R19 | `make lint` fails for `@effect/platform-bun` or `@oblik/config` imported in `domain/`, and passes for `effect`, `vitest` and `@effect/vitest` in a `domain/*.test.ts`. `git grep -E "Date.now|new Date\(|randomUUID" -- 'domain/**/*.ts'` finds nothing. A test fixes time with `TestClock` and ids with `TestCrypto`. |
| R20–R22 | `packages/db` and `packages/storage` hold no code of ours (removed in S21), and nothing hand-writes a key-value stub. Removing `API_PORT` gives a startup `ConfigError` naming it. A lock refresh equal to or longer than the expiration fails `QueueConfig.layer` with `QueueLockRefreshIntervalInvalidError` naming both variables (`packages/config` seam). `.env.example` lists every variable read. |
| R23–R25 | `example-summary.job.ts` exports `ExampleSummaryJob` with `enqueue` and `ExampleSummaryJob.worker`; `apps/worker/src` holds no job logic and no `handlers/` folder. Swapping the in-memory and SQLite queue layers changes only `apps/*/src/layer.ts`. |
| R26–R29 | With the worker stopped, three `POST /examples` queue three jobs; starting the worker logs three job results. A job made to fail is retried per the schedule (tested with `TestClock`) and then dead-lettered. SIGTERM during a job leaves it for the next worker at the same attempt. |
| R30–R33 | `packages/api-contract` imports only `effect`. Editing an endpoint without regenerating fails `make check`; `openapi.json` documents the 400. Through `@oblik/api-client`, an unknown id resolves to `{ ok: false, error: { _tag: <contract 404> } }`, a bad body to the 400's tag, a stopped server to the transport tag, and no call rejects. A `switch` over `error._tag` missing a case fails `make typecheck`. `import 'effect'` in `apps/web/src/features/` fails `make lint`. |
| R34–R36 | `make dev-web` keeps HMR. `make dev-api`: a forked ticker logs once per second; edit a handler, `curl` again: the response changed, one listening socket, the ticker still logs once per second. `make dev-worker`: edit a file, one consumer runs. SIGTERM logs finalizers. |
| R37a | `effect.md` lists the four-step order and the layer limits; a code search finds no `Bun.*` or `node:` call where an `effect` module in use covers the same need (e.g. `Bun.file` beside `FileSystem`, `console.log` beside `Effect.log`). |
| R37b | `effect.md` states the rule. `git grep -n "new Date\|Date.now"` outside `apps/web` finds nothing. Review of the slice finds no native array, object, string or date method and no hand-written helper where an `effect` module covers it. |
| R37–R40 | The files exist within budget; the knowledge-doc topics in R38 each have a section; no Cyrillic in `.claude/`, `docs/`, code. |

## Open questions

None. Settled by grilling and experiments on 2026-10-16.

## To verify during implementation

- **V1** — Moot: `make vendor-effect` runs `git subtree pull`, which makes no shallow fetch, so
  `.git/shallow` never appears (settled in S3).
- **V2** — The patched `tsc -b` on the project references setup (only plain `tsc` 7.0.2 was run
  on the probes). Settled in S6: it builds the 14 referenced projects, none under `repos/`, and
  emits only into the gitignored cache.
- **V3** — vitest 5 picks the `minimal` reporter when it detects an agent (`CLAUDECODE`); whether
  `make test` should force `--reporter=default`. Settled in S5: no forced reporter.
