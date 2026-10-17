# Effect setup — architecture

> Ticket: `2026-10-16_effect-setup` · Requirements: [feature.md](./feature.md)

## Overview

The layers and their import rules stay as they are. What changes is how they are composed.
Every dependency that varies becomes a `Context.Service` with a `Layer` per implementation; what
does not vary is a value or a function (D17). The only places that choose implementations are the
composition roots `apps/{api,worker}/src/layer.ts`.
The `example` slice now crosses three processes:

```mermaid
sequenceDiagram
  participant W as apps/web (browser)
  participant C as @oblik/api-client
  participant A as apps/api
  participant Q as queue (SQLite file in dev)
  participant K as apps/worker
  W->>C: examples.create({ payload })
  C->>A: POST /examples (HttpApiClient over fetch)
  A->>A: ExampleService.create: build, save, ExampleSummaryJob.enqueue
  A->>Q: send SummarizeExample, id "example-summary:<id>"
  A-->>C: 201 ExampleDto · 422 · 400 · 500
  C-->>W: Promise<Result> (never rejects)
  K->>Q: consume (lock, attempt n)
  K->>K: handle: summarizeExample, log
  Note over K,Q: failure → retry on the queue's Schedule → dead-letter after maxAttempts
```

How a process is assembled:

```mermaid
graph LR
  subgraph "apps/api/src/layer.ts"
    ApiHttp["ApiHttp<br/>HttpApiBuilder.layer(Api)"] --> Handlers["ExampleHandlers · HealthHandlers<br/>RequestValidationTransform"]
    Handlers --> ExampleService["ExampleService.layer<br/>(bundles ExampleSummaryJob.layer)"]
    ExampleService -. leaf .-> ExampleRepositoryMemory
    ExampleService -. leaf .-> QueueClientSqlite
    ExampleService -. leaf .-> Crypto["BunServices (Crypto)"]
  end
  subgraph "apps/worker/src/layer.ts"
    Worker["ExampleSummaryJob.worker"] -. leaf .-> QueueClientSqlite2["QueueClientSqlite"]
    Worker -. leaf .-> LanguageModelStub
  end
  QueueClientSqlite2 -. same file .- QueueClientSqlite
```

- **Contract first.** `@oblik/api-contract` is the one definition of the HTTP surface. The api
  implements it, `@oblik/api-client` derives from it, and `openapi.json` is generated from it.
- **Jobs cross processes, data does not.** The repository is in-memory per process, so a job
  message carries every field the job needs.
- **Layers bundle what has one implementation.** A `static layer` provides every dependency with a
  single implementation; the leaves that vary (ports, clients, platform services) stay open, and
  only the composition roots and tests choose them (D16).
- **The queue is ours, its engine is not.** `packages/queue` defines `JobQueue { send, consume }`;
  `PersistedQueue` implements it today, SQS later (D1).

## Structure

`★` new · `✎` rewritten · `✗` removed. Every workspace not listed is unchanged.

```text
.
├── repos/effect/                          ★ git subtree --squash of Effect-TS/effect at effect@<pinned>
├── vitest.config.ts                       ★ one root config: default exclude + repos/**
├── package.json                           ✎ catalogs effect · typescript · tools; scripts test, prepare
├── tsconfig.base.json                     ✎ plugins: @effect/language-service
├── biome.json                             ✎ domain: no workspace, no @effect/* but vitest; web client bans effect; !repos
├── Makefile                               ✎ typecheck = tsc -b; test → vitest; vendor-effect; openapi
├── .husky/{pre-commit,pre-push}           ✎ make typecheck · make test
├── .github/workflows/ci.yml               ✎ tsc --version check, make typecheck, bun run test
├── .env.example · .gitignore              ✎ QUEUE_*; LOG_LEVEL literal; .data/
├── .claude/
│   ├── rules/effect.md                    ★ v3 memory is wrong · source order · data primitives · project choices
│   ├── rules/{tooling,naming}.md          ✎
│   └── settings.json                      ✎ deny `bun test` (Bun's runner, not vitest)
├── README.md                              ✎ links docs/knowledge/effect.md
├── {domain,infrastructure,application,packages,apps}/CLAUDE.md ✎ Effect conventions
├── docs/knowledge/
│   ├── effect.md                          ★
│   └── {tooling,architecture}.md          ✎
├── domain/
│   ├── shared/                            ✗ Id helper and DomainError replaced by Schema
│   └── example/
│       ├── example.model.ts               ✎ ExampleId (branded Schema), Example (Schema.Class)
│       ├── example.error.ts               ✎ Schema.TaggedError
│       ├── example.service.ts             ✎ ExampleRepository port (no layer) · buildExample
│       └── example.service.test.ts        ✎
├── infrastructure/
│   ├── shared/
│   │   ├── outbox.repository.ts           ✎ OutboxMessage as Schema.Struct (stub)
│   │   └── queue.client.ts                ★ QueueClientSqlite: QueueConfig → createQueueClientSqlite
│   └── example/
│       ├── example.repository.ts          ✎ ExampleRepositoryMemory
│       ├── example.queue.ts               ✎ SummarizeExample, exampleSummaryQueue (a definition value)
│       ├── example.prompt.ts              ★ examplePrompt(input)
│       ├── example.llm.ts                 ✎ summarizeExample (a function, not a service)
│       └── example.storage.ts             ✗ keys come from KeyValueStore.prefix where objects are stored (D21)
├── application/example/
│   ├── example.service.ts                 ✎ ExampleService (create, get)
│   ├── example-summary.job.ts             ★ ExampleSummaryJob.enqueue · ExampleSummaryJob.worker
│   ├── create.use-case.ts                 ✗ folded into ExampleService.create
│   └── example.service.test.ts · example-summary.job.test.ts ✎ ★
├── packages/
│   ├── config/{config,index}.ts           ✎ <Area>Config services, each with a layer · load.ts ✗
│   ├── queue/{queue,memory,sqlite}.ts     ✎ JobQueue · QueueClient · QueueError · two layers (client.ts ✗)
│   ├── llm/client.ts                      ✎ LanguageModelStub
│   ├── db/ · storage/                     ✗ effect's KeyValueStore replaces them; the empty workspaces go in S21 (D21)
│   ├── api-contract/                      ★ @oblik/api-contract
│   │   ├── api.ts · example.ts · health.ts · validation.ts · index.ts
│   │   ├── openapi.ts                     ★ writes openapi.json (make openapi)
│   │   ├── openapi.json                   ★ committed
│   │   └── openapi.test.ts                ★ drift check
│   └── api-client/{client,result,index}.ts ✎ createApiClient → Promise<Result>
└── apps/
    ├── api/src/{main,layer,http,validation}.ts ✎ ★  · http.test.ts ✎
    ├── worker/src/{main,layer}.ts         ✎ · handlers/ ✗
    └── web/src/{main.ts, shared/api.ts, features/example/health-panel.ts} ✎
```

`packages/api-contract` follows the new-workspace checklist in `.claude/rules/tooling.md`. Each
workspace that imports `effect`, `@effect/*` or `@effect/vitest` declares it from `catalog:effect`,
because the isolated linker resolves only declared dependencies.

## Contracts

Sketches of the shape, checked against the installed `effect@4.0.5` by probes. The implementer
verifies the final spelling against `repos/effect`.

### Domain

```ts
// domain/example/example.model.ts
export const ExampleId = Schema.String.check(Schema.isUUID()).pipe(Schema.brand('ExampleId'))
export type ExampleId = typeof ExampleId.Type
export class Example extends Schema.Class<Example>('Example')({
  id: ExampleId, name: Schema.String, createdAt: Schema.DateTimeUtc,
}) {}

// domain/example/example.error.ts — no HTTP status here
export class ExampleNameInvalidError extends Schema.TaggedError<ExampleNameInvalidError>()(
  'ExampleNameInvalidError', { input: Schema.String }) {}
export class ExampleNotFoundError extends Schema.TaggedError<ExampleNotFoundError>()(
  'ExampleNotFoundError', { id: ExampleId }) {}

// domain/example/example.service.ts — a port has no layer; implementations live in infrastructure
export class ExampleRepository extends Context.Service<ExampleRepository, {
  readonly upsert: (example: Example) => Effect.Effect<void>
  readonly selectById: (id: ExampleId) => Effect.Effect<Option.Option<Example>>
}>()('@oblik/domain/example/ExampleRepository') {}

// time and id come in; the name is trimmed with String.trim and rejected when empty
export const buildExample: (input: {
  readonly id: ExampleId; readonly name: string; readonly createdAt: DateTime.Utc
}) => Effect.Effect<Example, ExampleNameInvalidError>
```

### Application

```ts
// application/example/example.service.ts — the entity's use cases are its methods
export class ExampleService extends Context.Service<ExampleService>()(
  '@oblik/application/example/ExampleService', { make: /* yields ExampleRepository, ExampleSummaryJob, Crypto */ }) {
  // create: Effect.fn('ExampleService.create')((input: { name: string }) =>
  //   DateTime.now → createdAt, crypto.randomUUIDv7 (PlatformError → orDie) → ExampleId.make,
  //   buildExample, repository.upsert, summaries.enqueue) : Effect<Example, ExampleNameInvalidError | QueueError>
  // get: Effect.fn('ExampleService.get') → Example | ExampleNotFoundError
  static readonly layer = Layer.effect(this, this.make).pipe(Layer.provide(ExampleSummaryJob.layer))
  // : Layer<ExampleService, never, ExampleRepository | QueueClient | Crypto>  — only the leaves stay open
}

// application/example/example-summary.job.ts — both sides of the job, one file
const queue = Effect.flatMap(QueueClient, (client) => client.make(exampleSummaryQueue))
const handle = Effect.fn('ExampleSummaryJob.handle')(function* (job: SummarizeExample) {
  const summary = yield* summarizeExample(job)
  yield* Effect.logInfo('example summarised').pipe(Effect.annotateLogs({ exampleId: job.exampleId, summary }))
})
export class ExampleSummaryJob extends Context.Service<ExampleSummaryJob>()(
  '@oblik/application/example/ExampleSummaryJob', {
  make: Effect.gen(function* () {
    const { send } = yield* queue
    const enqueue = Effect.fn('ExampleSummaryJob.enqueue')(function* (example: Example) {
      yield* send(new SummarizeExample({ exampleId: example.id, name: example.name }),
        { id: `example-summary:${example.id}` })
    })
    return { enqueue } as const
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)                     // open: QueueClient
  static readonly worker = Layer.effectDiscard(Effect.gen(function* () {    // open: QueueClient | LanguageModel
    const { consume } = yield* queue
    yield* Effect.forkScoped(consume(handle))
  }))
}
```

`handle` is a function of the module, not a method, so `ExampleSummaryJob.layer` needs only the
queue client and the api never builds an LLM layer (D2). `enqueue` and `worker` open the queue
separately; two `PersistedQueue.make` calls with one name share the store and its dedup (probed).
`handle`'s interrupt path does nothing asynchronous, so a `--watch` restart releases the job in time.

### Infrastructure

```ts
// infrastructure/example/example.queue.ts — a definition value, not a service (D17)
export class SummarizeExample extends Schema.Class<SummarizeExample>('SummarizeExample')({
  exampleId: ExampleId, name: Schema.String,   // only what the job reads
}) {}
export const exampleSummaryQueue = {
  name: 'example-summary', schema: SummarizeExample,
  maxAttempts: 5, retrySchedule: Schedule.exponential('1 second'),
} satisfies QueueDefinition<typeof SummarizeExample>

// infrastructure/example/example.prompt.ts — a typed function, no template engine (D14)
export const examplePrompt = (input: { readonly name: string }): string =>
  String.stripMargin(`|Summarise the example "${input.name}".`)

// infrastructure/example/example.llm.ts — a function with a requirement, not a service (D17)
export const summarizeExample = Effect.fn('summarizeExample')(function* (input: { readonly name: string }) {
  const response = yield* LanguageModel.generateText({ prompt: examplePrompt(input) })
  return response.text
})  // : Effect<string, AiError, LanguageModel>

// infrastructure/example/example.repository.ts — implements the domain port
export const ExampleRepositoryMemory: Layer.Layer<ExampleRepository>  // Ref<HashMap<ExampleId, Example>>

// infrastructure/shared/queue.client.ts — config turns into client options here
export const QueueClientSqlite = Layer.unwrap(Effect.map(QueueConfig, createQueueClientSqlite)).pipe(
  Layer.provide(QueueConfig.layer),
)
```

### Packages

```ts
// packages/queue — generic; the engine never leaks
export interface QueueDefinition<S extends Schema.Top> {
  readonly name: string; readonly schema: S
  readonly maxAttempts: number; readonly retrySchedule: Schedule.Schedule<unknown, number>
}
export interface JobQueue<A> {
  readonly send: (message: A, options: { readonly id: string }) => Effect.Effect<void, QueueError>
  // loops forever; logs each failed attempt (Warn, n/max) and the last one as dead-lettered (Error);
  // a failure never ends the loop; an interrupt releases the in-flight message without counting it
  readonly consume: <E, R>(handle: (message: A) => Effect.Effect<void, E, R>) => Effect.Effect<never, QueueError, R>
}
export class QueueClient extends Context.Service<QueueClient, {
  // Codec<A, I> has no decoding or encoding services, which JobQueue could not carry
  readonly make: <A, I>(definition: QueueDefinition<Schema.Codec<A, I>>) => Effect.Effect<JobQueue<A>>
}>()('@oblik/queue/QueueClient') {}
export class QueueError extends Schema.TaggedError<QueueError>()('QueueError', { cause: Schema.Defect() }) {}
// queue.ts also exports layerPersisted: Layer<QueueClient, never, PersistedQueueStore>, kept out of index.ts
export const QueueClientMemory: Layer.Layer<QueueClient>                    // layerPersisted + layerStoreMemory
export const createQueueClientSqlite: (options: QueueClientSqliteOptions /* filename, lockExpiration,
  lockRefreshInterval */) => Layer.Layer<QueueClient, SqlError>              // + layerStoreSql + SqliteClient.layer

// packages/config — one service per area, each with its layer; a root merges the ones it needs
export class ApiConfig extends Context.Service<ApiConfig, { readonly port: number }>()('@oblik/config/ApiConfig') {
  static readonly layer = Layer.effect(this, Config.all({ port: Config.Port('API_PORT') }))
}   // : Layer<ApiConfig, Config.ConfigError> — the error names the first missing or invalid variable
// WebConfig { port: WEB_PORT } · RuntimeConfig { nodeEnv: NODE_ENV, logLevel: Config.LogLevel(LOG_LEVEL), "Info" }
// QueueConfig { filename: QUEUE_SQLITE_PATH, lockExpiration: 15 s, lockRefreshInterval: 5 s (QUEUE_LOCK_*) }
//   : Layer<QueueConfig, ConfigError | QueueLockRefreshIntervalInvalidError> — refresh < expiration (D20)
export const MinimumLogLevelFromConfig: Layer.Layer<never, ConfigError> // References.MinimumLogLevel; bundles RuntimeConfig.layer

// packages/llm/client.ts
export const LanguageModelStub: Layer.Layer<LanguageModel.LanguageModel>   // LanguageModel.make, canned text
// objects and rows: KeyValueStore (effect/persistence) — layerMemory now, layerSql / layerFileSystem later;
//   KeyValueStore.prefix(store, 'examples/') namespaces keys, toSchemaStore(store, schema) types the values (D21)
```

### HTTP contract and client

```ts
// packages/api-contract — imports only effect; DTOs and errors of its own
export class ExampleDto extends Schema.Class<ExampleDto>('ExampleDto')({
  id: Schema.String, name: Schema.String, createdAt: Schema.DateTimeUtc }) {}
export class ExampleNotFound extends Schema.TaggedError<ExampleNotFound>()(
  'ExampleNotFound', { id: Schema.String }, { httpApiStatus: 404 }) {}
export class ExampleNameInvalid extends Schema.TaggedError<ExampleNameInvalid>()(
  'ExampleNameInvalid', { message: Schema.String }, { httpApiStatus: 422 }) {}
export class RequestInvalid extends Schema.TaggedError<RequestInvalid>()('RequestInvalid', {
  kind: Schema.String,
  issues: Schema.Array(Schema.Struct({ path: Schema.Array(Schema.String), message: Schema.String })),
}, { httpApiStatus: 400 }) {}
export class RequestValidation extends HttpApiMiddleware.Service<RequestValidation>()(
  '@oblik/api-contract/RequestValidation', { error: RequestInvalid }) {}

export const ExampleGroup = HttpApiGroup.make('examples')
  .add(HttpApiEndpoint.post('create', '/examples', {
    payload: Schema.Struct({ name: Schema.String }), success: ExampleDto /* 201 */, error: [ExampleNameInvalid] }))
  .add(HttpApiEndpoint.get('byId', '/examples/:id', {
    params: { id: Schema.String }, success: ExampleDto, error: [ExampleNotFound] }))
// `.middleware()` reaches only endpoints added before it, so it is the last call, on the whole API
export const Api = HttpApi.make('oblik').add(HealthGroup, ExampleGroup)
  .middleware(RequestValidation)
  .annotate(HttpApi.ParseOptions, { errors: 'all' })

// packages/api-client — derived from the contract, no hand-written endpoint
export type Result<A, E> = { readonly ok: true; readonly value: A } | { readonly ok: false; readonly error: E }
export type ApiClient = Promised<HttpApiClient.ForApi<typeof Api>>
// each method: (request) => Promise<Result<A, Declared | RequestInvalid | InternalServerError
//   | HttpClientError (TransportError, DecodeError) | SchemaError | ClientDefect>>
export const createApiClient: (baseUrl: string, options?: { readonly fetch?: typeof fetch }) => ApiClient
```

- **The facade** builds `HttpApiClient.make(Api, { baseUrl })` once in a `ManagedRuntime` over
  `FetchHttpClient.layer`; `options.fetch` overrides `FetchHttpClient.Fetch`. Every call runs
  through `Effect.exit`, so a typed failure becomes `{ ok: false, error }` and a defect becomes a
  `ClientDefect`; the promise never rejects.
- **The api** (`apps/api/src/http.ts`) maps domain errors to contract errors with
  `Effect.catchTags` and turns infrastructure errors (`QueueError`) into defects, which answer 500.
  A group's builder is an `Effect.fnUntraced` that yields `ExampleService` once,
  before `handlers.handle(…)`: a service yielded inside a handler becomes a per-request requirement
  (`Request<"Requires", …>`) that no layer satisfies.
  `validation.ts` holds the one `HttpApiMiddleware.layerSchemaErrorTransform(RequestValidation, …)`.
  It is provided **to the group layers**, because a group captures its context when built.
- **`ApiHttp`** in `layer.ts` is `HttpApiBuilder.layer(Api)` with the groups and middleware, and no
  server. `ExampleHandlers` bundles `ExampleService.layer`, so the root provides only the leaves.
  `main.ts` serves it with `HttpRouter.serve` over `BunHttpServer.layer({ port })` and starts it
  with `BunRuntime.runMain(Layer.launch(…))`. Tests turn the same layer into a web handler.

### Processes

| Process | Entry | Composition root provides |
|---|---|---|
| api | `BunRuntime.runMain(Layer.launch(ApiServer))` | `ApiConfig.layer` (it reads the port), `MinimumLogLevelFromConfig`, `BunServices.layer` (Crypto), `ExampleRepositoryMemory`, `QueueClientSqlite`; the last two bundle their config areas |
| worker | `BunRuntime.runMain(Layer.launch(ExampleSummaryJob.worker.pipe(…)))` | `MinimumLogLevelFromConfig`, `QueueClientSqlite`, `LanguageModelStub` |
| web | `Bun.serve` with HMR, unchanged shape | reads `WebConfig`, `ApiConfig`, `RuntimeConfig` once, from their merged layers |

`api` and `worker` run in dev with `--watch`; `web` keeps `--hot` (D12). `QUEUE_SQLITE_PATH` in
`.env.example` is `"../../.data/queue.sqlite"`: both apps run from `apps/<app>`, so the relative path
lands on one file at the root `.data/`, which is gitignored.

## Configuration

- **Catalogs** (exact pins, re-verified at implementation time):
  - `effect`: `effect`, `@effect/platform-bun`, `@effect/sql-sqlite-bun`, `@effect/vitest` (4.0.5);
  - `typescript`: `typescript`, `@effect/tsgo` (0.53.2, embeds TS 7.0.2);
  - `tools`: `vitest` 5.0.5, plus the existing Biome and husky. `runtime` keeps `@types/bun`.
- **Root scripts:** `prepare` = `husky && effect-tsgo patch`; `test` = `bun --bun vitest run`.
  `make test` runs `bun run test`, and `bun test` (Bun's own runner) is denied in `settings.json`.
- **Typecheck gate:** `make typecheck` = `bunx tsc -b`, the only typecheck gate. The patched
  `tsc -b` walks the project references, writes declarations to the existing cache, and fails on
  type errors and on Effect errors and warnings (`ignoreEffectWarningsInTscExitCode: false`, the
  default) (D8). `unstableApiUsage` is lowered to `suggestion`, and `includeSuggestionsInTsc` is
  `false` (D19). `setup` scaffolds it with
  `effect-tsgo setup`, then trims the result.
- **vitest:** one root `vitest.config.ts` that only adds `repos/**` to the default exclude. There
  are no projects: vitest collects every `*.test.ts` from the root, so a new workspace needs no
  test config.
- **Biome:**
  - no v3 ban: no v3 package is installed, so an import fails `make typecheck` with TS2307 (D18);
  - the `domain` override bans `@oblik/**` and `@effect/**` except `@effect/vitest`, for code and
    tests alike; there is no `*.test.ts` override (D18);
  - the web client override adds `effect`, `effect/**` and `@effect/**`; the server entry
    `src/main.ts` keeps its own override and may use `effect`;
  - `files.includes` gains `!repos`.
  Relative imports into `repos/` already fail the existing relative-path ban.
- **Make:**
  - `vendor-effect` runs `git subtree pull --squash --prefix repos/effect` of the `effect@<pinned>` tag (D13);
  - `openapi` writes `openapi.json`;
  - `ids` excludes `repos/`.
- **Hooks and CI:**
  - `pre-commit`: `make typecheck`, `biome check --staged`;
  - `pre-push`: `make test`;
  - CI `static` replaces `bun check` with `tsc --version | grep effect-tsgo` and `make typecheck`,
    and CI `test` runs `bun run test`.

## Seams

Tests observe behaviour only here. Each row is one test file or suite.

| Seam | Catches | Misses |
|---|---|---|
| `buildExample(input)` (`domain`) | trimming, blank-name rejection as `ExampleNameInvalidError`, id and time passed through | everything with an effect |
| `ExampleService.layer` (`create`, `get`) over `ExampleRepositoryMemory`, `QueueClientMemory`, `TestClock`, a fresh `TestCrypto.layer(seed)` per test (`application`) | saves and enqueues once, deterministic UUIDv7 and `createdAt`, job id `example-summary:<id>`, a repeated send deduplicated, a blank name saves and enqueues nothing, not-found | HTTP, the SQLite store |
| `ExampleSummaryJob.layer` + `ExampleSummaryJob.worker` over `QueueClientMemory`, a recording or failing `LanguageModel`, `TestClock` (`application`) | enqueue → handle round trip, the prompt reaching the model, retries on the queue's schedule, dead-letter and its log after `maxAttempts`, interrupt releasing without counting the attempt | the SQL store and its DB clock, `LanguageModelStub`, two processes |
| `JobQueue` suite run against `QueueClientMemory` and `createQueueClientSqlite` on a temp file (`packages/queue`) | send and consume, dedup by id, a message surviving a rebuilt layer on the same file ("worker was stopped"), the loop continuing after a failure | lock-expiry timing (real time), SQS |
| a service's `layer` under `ConfigProvider.fromUnknown` (`packages/config`) | defaults, a `ConfigError` naming the missing variable, the `LOG_LEVEL` literals reaching `MinimumLogLevel`, a lock refresh not shorter than the expiration failing `QueueConfig.layer` | `--env-file` loading |
| `HttpRouter.toWebHandler(ApiHttp …)` driven by `createApiClient(url, { fetch })` and raw `Request`s (`apps/api`) | each status and JSON body on the wire, each typed `Result`, a 400 listing every issue, `POST /examples` enqueuing the job, a defect or an unencodable response answering 500 | the Bun socket, `--watch` |
| `createApiClient` over a fake `fetch`, plus type tests (`packages/api-client`) | the transport error on a refused connection, `SchemaError` / `DecodeError` on a wrong body or status, no rejected promise, an exhaustive `switch` over `error._tag` | a real server |
| `openapi.test.ts`: `OpenApi.fromApi(Api)` equals the committed `openapi.json` (`packages/api-contract`) | contract drift, the documented 400 and 500 | behaviour the schema does not express |
| `make check` on probe edits (by hand, in `/ticket-verify`) | the Biome bans, a floating Effect failing `tsc -b`, `repos/` ignored by Biome, vitest, `tsc -b` and `make ids` | allowed edges |

Checked by hand in `/ticket-verify`, not by tests:
- the cross-process path (three `POST`s with the worker stopped, then three results);
- `--watch` restarts with one server and one consumer;
- SIGTERM finalizers;
- LazyVim.

## Decisions

- **D1 — An own queue port, `JobQueue { send, consume }` in `packages/queue`, with `PersistedQueue`
  behind it.** `PersistedQueue` provides at-least-once delivery, retries on a `Schedule`,
  `maxAttempts`, dead-lettering and dedup by id, with memory and SQLite stores. Callers see only
  `send` and `consume`, so SQS later becomes one more `QueueClient` layer chosen in the composition
  roots. *Rejected:*
  - `PersistedQueue` used directly in `application`: SQS cannot be a `PersistedQueueStore`, because
    visibility timeouts and a separate dead-letter queue do not map onto its lock rows;
  - `effect/cluster`: it needs shared storage and runners, which is too much for one queue;
  - a hand-written poll loop: it would re-implement retries and locks.
- **D2 — `example-summary.job.ts` owns both sides of the job: `ExampleSummaryJob.enqueue` (a method)
  and `ExampleSummaryJob.worker` (a layer that wires the module's `handle` to `consume`).** The job
  logic lives in one file, and the worker only launches the layer. `handle` is not a method, because
  then `ExampleSummaryJob.layer` would require `LanguageModel`, and the api would have to build an
  LLM layer and carry its secrets. `ExampleService.create` calls `enqueue`, so the order "save, then
  send" stays in `application`. The message is a command named after the job (`SummarizeExample`),
  not an event: a job queue has one consumer. *Rejected:*
  - `enqueue` and `handle` as two methods of one service: this couples the api to the LLM;
  - a `handle` method that declares its own requirement: it leaks requirements into the service
    interface, which upstream style and the language service warn against;
  - the handler in `apps/worker`: job logic in an app;
  - an `ExampleCreated` event: it promises fan-out that a job queue does not have. It returns with
    an SNS-style topic.
- **D3 — `@oblik/api-contract` is a package of its own, with its own DTOs and errors, importing only
  `effect`; `openapi.json` is generated from it and committed.** Web and api share types without the
  browser importing server code, and the wire format can evolve apart from the domain. *Rejected:*
  - the contract inside `apps/api`: web cannot import an app;
  - domain schemas on the wire: this couples storage to transport, and the domain carries no HTTP
    status;
  - `openapi-typescript` from a live spec: it needs a running server and a second type system.
- **D4 — The web client is a `Promise<Result>` facade derived from the contract by one mapped type;
  `fetch` is its only option.** Browser code gets exhaustive, typed errors without importing
  `effect`, and a new endpoint needs no client code. The `fetch` option is also the api test seam.
  *Rejected:*
  - exposing the Effect client to web code: Effect in browser code is out of scope;
  - rejecting promises: the errors become untyped;
  - a wrapper per endpoint: shallow, and it drifts from the contract.
- **D5 — Errors travel with their real HTTP status and a typed JSON body.**
  - One `RequestValidation` middleware turns schema errors into a `RequestInvalid` 400 listing
    every issue (`ParseOptions { errors: 'all' }`). It is applied last, on the whole `HttpApi`.
  - Domain errors map to contract errors in `http.ts`; infrastructure errors become defects (500).
  - Endpoint errors are arrays, because a `Schema.Union` collapses to 500.

  *Rejected:*
  - status 200 with an error body: it breaks HTTP semantics and caches;
  - the default 400: its empty body reaches the client as an untyped `DecodeError`;
  - mapping `QueueError` to a typed 503: one more case for every caller, for a failure no caller
    can handle.
- **D6 — Domain models are `Schema.Class` with branded ids; errors are `Schema.TaggedError`; ports
  are `Context.Service` declarations with no layer; `buildExample` takes the id and time as input
  and returns an `Effect`.** The schemas serialise across HTTP and the queue, and the domain stays
  free of platform services: the application gets time from `Clock` and UUIDv7 from `Crypto`.
  *Rejected:*
  - `Data.TaggedError`: it has no schema, so it cannot cross a process;
  - `Model` (`effect/unstable`): unstable;
  - the domain yielding `Clock` and `Crypto`: every domain test would need the test services.
- **D7 — Settings are one `Context.Service` per area with `static layer = Layer.effect(this,
  Config.all({...}))`; the layer that reads an area bundles it (D16), and tests swap the
  `ConfigProvider`.** Only Effect's `Config` module is involved, so a startup failure is Effect's
  `ConfigError`, naming the first missing or invalid variable, or, for the one cross-field rule,
  `QueueLockRefreshIntervalInvalidError` (D20). A config area has one
  implementation, so `QueueClientSqlite` bundles `QueueConfig.layer` and
  `MinimumLogLevelFromConfig` bundles `RuntimeConfig.layer`; a root provides an area itself only
  when it reads it directly (`main.ts`). A bundled area cannot be replaced by a ready value, so a
  test provides `ConfigProvider.layer(ConfigProvider.fromUnknown(…))` outside the whole bundle.
  *Rejected:*
  - the roots `Layer.mergeAll` every area: a list that restates which leaf reads what, and a test
    on `QueueClientMemory` would still need `QueueConfig`;
  - a generic `createConfigLayer` running `Effect.validate` so one error names every variable:
    about 60 lines of type machinery for a dev-time message, and `Context.Key & { config }`
    fights Effect's unify symbol (amends R21);
  - a `Schema` over the raw env record: it loses the `ConfigProvider` seam.
- **D8 — The patched `tsc -b` is the single typecheck gate.** It is TS 7 over the same
  references, so it reports every type error `bun check` does, plus the Effect diagnostics; it
  walks the references incrementally and fails on Effect warnings by default. *Rejected:*
  - `bun check` alone: it ignores tsconfig plugins, and a probe with a floating Effect passes it
    while the patched `tsc` fails;
  - both gates, as first built in S6: every type error is reported twice, and the gate has two
    spellings to keep in sync;
  - `effect-tsgo diagnostics --strict --project` in a loop over workspaces: it has no build mode,
    so nine cold runs.
- **D9 — vitest 5 with `@effect/vitest` on the Bun runtime, one root config, no projects.**
  `it.effect`, `it.layer` and `TestClock` need vitest; `bun --bun` keeps Bun APIs; probes confirmed
  `#imports`, `.ts` exports and exit 1 on any failure. The root config only adds `repos/**` to the
  default exclude. *Rejected:*
  - `bun:test`: `@effect/vitest` fails under it;
  - vitest on Node: no Bun APIs;
  - a project per workspace from the `workspaces` globs: vitest's project globs also match files
    such as `packages/CLAUDE.md` and refuse to start, and the workaround is ~20 lines of glob
    expansion for nothing the plan needs, only names in the reporter;
  - a config per workspace: a forgotten one silently skips its tests.
- **D10 — Retries, schedules and dead-letters are tested on the memory store under `TestClock`;
  the SQLite store is tested only for persistence and dedup.** The SQL store measures delays with
  the database clock in whole seconds, which `TestClock` cannot drive. *Rejected:* SQLite with a live
  clock and `Schedule.spaced(0)`: slow, and it still skips real backoff.
- **D11 — Dead letters are observed through logs: `consume` logs each failed attempt and the final
  dead-lettering; failed rows stay in the table.** `PersistedQueue` offers no hook or read API.
  *Rejected:* a `deadLetters()` read on the port: it ties the port to the SQL store, whereas an SQS
  dead-letter queue is a separate queue.
- **D12 — `api` and `worker` run in dev with `--watch`, `web` with `--hot`.** `bun --hot`
  re-evaluates modules without stopping the previous Effect runtime, so servers and fibers pile up.
  *Rejected:* `--hot` with a `globalThis` guard: it works, but every entry carries the guard and
  its subtleties.
- **D13 — Effect's source is vendored as a `git subtree --squash` at `repos/effect`, pinned to the
  catalog's version.** Agents read the exact code, tests and `LLMS.md` of the installed version
  offline. `make vendor-effect` is one `git subtree pull --squash` of the pinned tag; the first
  vendoring is a one-time `git subtree add` with the same arguments. A bump and its vendoring land
  in one PR as two branch commits, because `git subtree` refuses a dirty tree and commits by
  itself. Another repository under `repos/` gets a target of its own. *Rejected:*
  - a submodule: clones and CI do not fetch it by default;
  - a manual depth-1 fetch of the tag: a fresh clone lacks the previous split commit, so it needs
    extra code to fetch that commit before every pull; `git subtree pull` fetches the tag's full
    history, which holds it, into the local `.git` only;
  - reading `node_modules`: no tests or docs there;
  - docs search: network-bound and drifts from the pin.
- **D14 — Prompts are typed functions in `<entity>.prompt.ts`.** A renamed variable fails the
  typecheck, and nothing has to be loaded or rendered. *Rejected for now:* Markdown templates with
  placeholders, optionally checked against a `Schema` in tests. They return when prompts grow long
  or non-developers edit them; imports of `.md` also differ between Bun and vitest.
- **D15 — The slice is rewritten bottom-up, after one step retires the plain code above `domain`
  that the rewrite would break.** A `domain` change breaks `application`, which breaks both apps,
  and the whole chain is far over 400 lines. Removing the plain use case, job adapters, worker
  handler and example routes first lets each later step write final code only; the example
  routes are absent between that step and the api step. *Rejected:*
  - bridges (plain code calling Effect through a `ManagedRuntime`, or Effect handlers wrapping
    plain promises): throwaway code in several steps that a reader of the branch must ignore;
  - one big-bang step: well over 1000 lines.
- **D16 — A `static layer` provides every dependency that has one implementation and leaves open
  the leaves that vary: ports (`ExampleRepository`), clients (`QueueClient`, `LanguageModel`) and
  platform services (`Crypto`).** Upstream recommends layers that carry their dependencies, and a
  provided dependency cannot be replaced from outside (probed: the bundled one wins). Leaving only
  the varying leaves open means the composition roots and tests supply the same short list, and no
  service needs a second `layerNoDeps` static. Layers are memoised by reference, so a leaf
  provided once is built once (probed). *Rejected:*
  - assembling every service in the composition roots: long roots that restate the dependency graph;
  - bundling everything plus `layerNoDeps` on every service: two statics per service, and tests
    unbundle level by level to reach a memory queue.
- **D17 — A service exists only when it holds a resource or something varies behind it; otherwise
  infrastructure exports a value or a function with requirements.** `exampleSummaryQueue` is a
  definition value and `summarizeExample` a function needing `LanguageModel`; `ExampleService`
  (the api's entry) and `ExampleSummaryJob` (it holds the queue handle) stay services. Each
  use case is a method of its entity's `<Entity>Service`. *Rejected:*
  - a service per adapter (`ExampleQueue`, `ExampleLlm`): pass-throughs that add a layer each;
  - a service per use case (`CreateExample.run`) over a thin `ExampleService`: a class, a layer
    and a root entry per verb, and the service in between is a middle man.
- **D18 — The `domain` guard is a deny-list shared by code and tests, and no rule bans v3
  packages.** `domain` bans `@oblik/**` (any workspace) and `@effect/**` except `@effect/vitest`,
  so `effect`, `#domain/**`, `vitest` and `@effect/vitest` pass, and a test follows its workspace's
  rule like every other file. *Rejected:*
  - an allow-list of `effect` and `#domain/**`: it needs a separate `*.test.ts` override that
    repeats the group, because Biome overrides replace the `noRestrictedImports` options (probed:
    a root `paths` ban is lost in every override), and it must widen for every test helper;
  - a v3 ban with a v4-replacement message: it would repeat in the root and every override
    (~116 lines), while TS2307 already fails an uninstalled v3 package and `repos/effect` is the
    reference for the v4 API.

- **D19 — `unstableApiUsage` is an editor-only suggestion, and `tsc -b` prints no suggestions.**
  Every module this ticket builds on beyond the core is `@stability unstable`: `effect/persistence`,
  the HTTP and AI modules, and all of `@effect/vitest`, which R14 requires in every Effect test. At
  the rule's default `warning`, each import fails the gate (found in S8). The choice is already
  made and mitigated by exact pins and `repos/effect` (see Risks), so the warning carries nothing
  to act on. `includeSuggestionsInTsc: false` keeps suggestion-level hints, such as
  `schemaClassMissingBrand`, out of every `make check` and `pre-commit` run; they still show in
  the editor. *Rejected:*
  - a `// @effect-diagnostics unstableApiUsage:off` directive per file: every test file and most
    adapters would carry one;
  - `off`: it also hides the hint in the editor;
  - `ignoreEffectWarningsInTscExitCode: true`: it lets every Effect warning through, which R8 forbids.

- **D20 — The lock rule of `QueueConfig` (refresh shorter than expiration) is checked in
  `QueueConfig.layer` and fails it with `QueueLockRefreshIntervalInvalidError`, a
  `Schema.TaggedError` whose message names both variables and their values.** A cross-field rule
  belongs to the area that reads both variables, so the config seam covers it and every reader of
  `QueueConfig` gets valid values. `Config.all` is an `Effect`, so `Effect.filterOrFail` with
  `Duration.isLessThan` adds the rule without millisecond math. *Rejected:*
  - the check in `QueueClientSqlite`, where the options are built: untested, because no seam
    reaches that layer;
  - Effect's `ConfigError`: its cause is only a `SourceError` or `SchemaError`, so a cross-field
    rule would need a hand-built `SchemaError` issue, and `Config` has no filter combinator;
  - `createQueueClientSqlite` checking its own `Duration.Input` options: a decode step and an
    error type in the generic package; its TSDoc keeps the constraint instead.

- **D21 — Objects and rows go through effect's `KeyValueStore` (`effect/persistence`), not
  hand-written `storage` and `db` clients.** It is a service with `layerMemory` today and
  `layerSql` or `layerFileSystem` later, so a real store is one more layer chosen in the roots
  (D16); `prefix(store, 'examples/')` namespaces keys and `toSchemaStore(store, schema)` decodes
  typed values. Nothing consumes it yet, so no code of ours wraps it. `packages/db` and
  `packages/storage` keep a `client.ts` of `export {}` until S21 removes them, because `tsc -b`
  rejects a project with no inputs (TS18003). *Rejected:*
  - `StorageClient` and `DbClient` on `Ref<HashMap>`: about 40 lines duplicating an effect
    primitive, with no consumer;
  - a `Schema.TemplateLiteral` key builder (`ExampleObjectKey`): `prefix` already namespaces keys
    where the store is used.

## Risks

| Risk | Mitigation |
|---|---|
| `effect/http`, `http-api`, `persistence`, `ai` are `@stability unstable`; a patch release may change them | exact lock-step catalog; `make vendor-effect` runs in the same PR as a bump, right after the bump's commit; the seams above catch behaviour changes |
| `effect-tsgo patch` replaces the `tsc` binary; an install without `prepare` leaves a stock `tsc`, which still typechecks but silently loses every Effect diagnostic | CI asserts `tsc --version` contains `effect-tsgo`; the troubleshooting section in `tooling.md` covers it |
| A group or API middleware skips endpoints added after it | `.middleware(RequestValidation)` is the last call on `Api`; a type test asserts `RequestInvalid` in every method's error union |
| `take` fails with the handler's error, so `Effect.forever` stops at the first failure | `consume` catches and logs per iteration; the `JobQueue` suite has a "loop continues after failure" case |
| A hard crash consumes the in-flight attempt (only an interrupt releases it) | lock expiry 15 s in dev; the worker shuts down through `runMain` on SIGINT/SIGTERM |
| A shared `TestCrypto` layer value continues its sequence | every test builds its own `TestCrypto.layer(seed)`; noted in `docs/knowledge/effect.md` |
| The relative `QUEUE_SQLITE_PATH` depends on the cwd | both apps run from `apps/<app>`; the value is `../../.data/queue.sqlite`; the startup log prints the resolved path |
| `api-client` puts about 51–55 KB gzip of Effect into the browser | accepted for now; the size is recorded in `effect.md`; Effect UI libraries are out of scope |
| Rewriting a whole layer may exceed ~400 lines per step | `/ticket-plan` splits by seam: domain, application, each package, api, worker, web |

## To verify during implementation

Carried over from `feature.md`: V1 (moot since S3: no shallow fetch), V2 (patched `tsc -b` on the
references; settled in S6: 14 projects, none under `repos/`, no tracked emits) and V3 (vitest
reporter under an agent; settled in S5: no forced reporter). New:

- **V4** — How the 500 enters every endpoint's error union: as an error of `RequestValidation`, or
  declared on the API. A defect's empty 500 body must then decode to `InternalServerError`, not to
  `DecodeError`.
- **V5** — Whether `Config.LogLevel` accepts lower-case values. If it does not, `.env.example`
  switches to `LOG_LEVEL="Info"`. Settled in S9: it does not; `.env.example` has `"Info"`.
- **V6** — vitest projects given as the root `workspaces` globs, with no config file per directory.
  Moot since S5: the root config declares no projects.
