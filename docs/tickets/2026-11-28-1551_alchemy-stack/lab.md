# Alchemy stack

Flow: lab · Worktree: `/Users/v/lab/app-template/.claude/worktrees/alchemy-stack` (N=1)

## Intent

The owner's words (2026-11-28), in the order they were said; where two disagree the later one
binds, and [Knowledge](#knowledge) states what binds now:

- "I want simple single config which could run it with bun."
- "I don't want hacks. I should be simple. Like we have infra configuration as on production."
- "I don't want to use ministack if we will use alchemy"
- "I'd like to stay on aws, because this is well paid skill."
- On the web: "I believe web will be dev server like nextjs, or something like this."
- "could we work with worktree as we did, and run e2e test as we do now?"
- "But do best from perspective of alchymy. Maybe group aws resource which we bould and simmilar
  things with alchymi deployment. Reorganise files if needed. But use lasteet best practices and
  recommendations."
- "I expect best written configuration as it possible from alchemy recommendations."
- "If needed breake the rules for now."
- "you could use full power of effect core, also adjust plan so you could struct logic in alchyme
  with it"
- "ok. lets try node and all should be inside deployment"
- "Now, will nodejs. alchemy and all related in deployment, and effect core all wire up alchemy
  code."
- "during implementatin agent could recheck ideas by reading and searching inside repos"
- After L1's numbers: "ok, lets continue and them will improve performance"

## Map

| Step | Goal, and how to see it | Pass | Kind | Status |
|---|---|---|---|---|
| L1 | The probe answers go or no-go on the checks below, in a throwaway worktree · visible: a table of what ran and its timings | minimal | learn | done |
| L2 | The api and the worker run on Node and no longer need Bun's server: their routes and services stand apart from the process wiring, the queue and file services take their operations, the tests run on Node · visible: `make check` green with `vitest` on Node | minimal | build | in progress |
| L3 | One stack in `deployment/` declares the queues, the bucket, the database, the api's and the worker's functions and the web; `make dev` runs it on floci · visible: `make dev`, a chat message gets its reply through the Function URL | minimal | build | todo |
| L4 | The e2e's two kinds: in-process on a floci container of their own, the journeys through the deployed stack · visible: `make test-e2e` green, its duration beside today's 6.09 s | minimal | build | todo |
| L5 | Pulumi and MiniStack are gone; `aws.md`, `tooling.md`, `architecture.md`, the worktree rules and the import guard say what holds · visible: `make check` green | minimal | build | todo |
| L6 | Later: the items of the open list the owner picks | hard | build | todo |

Every step opens by rechecking the notes it builds on against `repos/alchemy`, as
[L1's notes](#notes) say. The steps past L1 are a proposal: L1's Output may redraw them.
Deploying to a real AWS account (a VPC, a private database, IAM, secrets, the edge) stays the
roadmap's [`aws-deployment`](../../knowledge/roadmap.md#9-aws-deployment), which builds on this
stack.

## L1 — The probe

Reference: `repos/alchemy/examples/aws-lambda-httpapi` (an Effect `HttpApi` on Lambda) and
`repos/alchemy/examples/aws-rds`, run as they are under `alchemy dev` · Budget: a throwaway
stack outside the ticket branch

### Shape

Not written: a learn step. Its draft lives in its own worktree
(`git worktree add -b wt/alchemy-probe .claude/worktrees/alchemy-probe HEAD`, then
`make worktree N=2 NAME=alchemy-probe`), never on this branch.

### Notes

**These notes are leads, not facts** (the owner, 2026-11-28). They were gathered in one session
by reading, mostly through agents' summaries, and nothing in them was run but what the table
below marks measured. So every step that builds on a note opens by checking it:

1. **Before a Shape, a design or a line of code that names an Alchemy API, find it in the
   vendored `repos/alchemy`** by `.claude/rules/alchemy.md`: the resource's file for its props,
   the nearest `examples/aws-*` for the order of the units, the integration test for what a
   guide leaves out. Quote it as `path:line` in the step's notes.
2. **A note that the source contradicts is corrected here in the same commit,** with what the
   source says; a note the source does not show is marked `assumed` until a run settles it.
3. **Read the whole unit, not the line a note cites:** a prop's neighbours, the provider's
   `reconcile`, the `Floci<Resource>Provider.ts` beside it. The notes were written from excerpts.
4. **The probe (L1) is the run** for whatever reading cannot settle; a later step that meets a
   new unknown stops and probes it the same way, in a worktree of its own.

A citation `aws: <path>` is `repos/alchemy/packages/aws/src/<path>`, `alchemy: <path>` is
`repos/alchemy/packages/alchemy/src/<path>`, `sql: <path>` is
`repos/alchemy/packages/sql/src/<path>`, `effect: <path>` is
`repos/effect/packages/effect/src/<path>`, and a guide named by its page (`aws/messaging/sqs`)
is that path under `repos/alchemy/website/src/content/docs/`. floci is not vendored: its notes
cite `alchemy-run/floci` at the tag `2.4.0-alchemy.3`, the image this Alchemy version pins
(`aws: Local/Floci.ts:47`).

| The notes on | Read from | Trust |
|---|---|---|
| Alchemy's API and its function runtime | the source now in `repos/alchemy`, by agents | a line number may be off; the claim is likely right |
| Alchemy's conventions | its guides and examples | a guide can lag its source: check the source |
| floci | its source at the pinned tag, by an agent | recheck before relying on a number |
| the web: benchmarks, AWS's new runtimes, others' practice | 2026-11-28 | dated |
| this repo under Node, and the bundle | runs in this worktree and one rolldown run by an agent | measured |

#### The checks

- [R] Each with what its failure means:
  1. The two reference examples run under `alchemy dev` here; a cold and a warm start, in
     seconds, beside `make up`. Fails → nothing below stands.
  2. A function in `deployment/` whose graph spans the workspaces bundles and loads on Node 24:
     the workspaces' `.ts` exports and `#<part>/*` imports resolve from `deployment/` under the
     isolated linker, and no `bun` import is left. Fails → the function's place or the linker.
  3. **The reload on our code:** an edit in `application/` to the next response, in seconds, with
     the stack's own re-plan (it restarts under `bun --watch` when a file it imports changes).
     Fails → the reason to choose Node is gone; say so before going on.
  4. The api's routes behind `fetch`: `HttpRouter.toHttpEffect` over the api's `HttpApi`, the
     per-request services provided to the returned effect, a cookie set and read through the
     Function URL. Fails → the api's entry is redrawn.
  5. The database: an instance of engine version 18 on floci, the host and port a function's
     container sees, TLS, a pool per invocation and one per environment, each timed over ten
     requests; the Drizzle migrations folder through the instance's `migrations` prop.
  6. One function on three queues: a batch of each reaches its own handler by its
     `eventSourceARN`, `batchItemFailures` come back, a handler's defect redelivers.
  7. The bindings behind our services: a queue sender and the file operations (multipart,
     presigned GET) from `AWS.SQS.SendMessage` and `AWS.S3.<Op>`, type-checked against our
     `QueueSender` and `S3Bucket`; a presigned URL made in a container opens from the host.
  8. Settings: a `Config` read while a layer is built in construction reaches the function; a
     secret's form in the function's configuration; whether a bound `AWS_REGION` fails the
     create.
  9. A `Context.Service` of ours provided to a function's construction and to the stack, its
     layer yielding resources: accepted, and the resources keep their ids.
  10. Two worktrees under `alchemy dev` at once, each with a database on host port 5432.
  11. The e2e: a floci container of its own on a free port, a stage's queues and bucket made
      through the SDK, per test; and `beforeAll(deploy(Stack))` with `dev: true`, per file; both
      in seconds beside today's.
  12. The web: a `StaticSite` with its `dev` command and a `Router` sending `/api/*` to the api's
      function.
  13. Where `.alchemy/` lands and how a function's logs are read when the stack file is
      `deployment/alchemy.run.ts`.
  14. A model's call silent for more than five minutes on Node's `fetch`: the worker's reply
      can take minutes, and `kernel/llm` relies on Bun's `timeout` option today.

#### The probe's run

- [A:ai] **Run on 2026-11-28 in `.claude/worktrees/alchemy-probe` (branch `wt/alchemy-probe`, the
  draft staged there, uncommitted):** the two reference examples copied as they are to
  `deployment/probe/httpapi` and `deployment/probe/rds`, and a stack of ours,
  `deployment/probe/app` (the api's real routes, a Postgres 18 instance with the repo's
  migrations, three queues, a worker, the file operations, the web). One machine, Docker
  29.9.3, Node 24.18.0, Bun 1.4.5, one run each unless a count is given. To repeat:
  `cd deployment/probe/app && PROBE_PLAIN=a PROBE_SECRET=b ../../node_modules/.bin/alchemy dev --stage probe_app`.

  | Check | Result | What ran, and its numbers |
  |---|---|---|
  | 1 the examples | passes | `aws-lambda-httpapi`: 27.5 s from the command to `Done` the first time (17.8 s of it floci's start), 9.1 s again; a function's first call 8.5 s, then 8 to 12 ms. `aws-rds` (Aurora, a network, a function): 24.7 s, a query through the Function URL 31 to 36 ms. `make up` in the same tree: 9.6 s, then 2.8 s |
  | 2 a function over the workspaces | passes | `deployment/probe/app/Api.ts` imports `@app-template/api`, `application`, `kernel`, `packages`; it bundles and answers on `nodejs24.x`. The api's `layer.ts` stays out: a Bun-free `apps/api/routes.ts` exports the routes and the use cases |
  | 3 the reload | passes, slower than today | an edit in `application/` and the api's handler to the next response: 2.6, 2.2, 2.1 s; the stack does not re-plan, the log shows `code swapped` alone. Today under `bun --watch`: 0.32, 0.31, 0.31 s |
  | 4 the routes behind `fetch` | passes with a wrapper | `HttpRouter.toHttpEffect` over the api's `HttpApi`, the use cases provided as a built context. **The cookie is lost as Alchemy runs `fetch`**: see the correction under "Serving the `HttpApi`" |
  | 5 the database | passes | Postgres 18.7 on floci; the drizzle-kit folder applied through `migrations` (one row in `__alchemy_migrations`, six tables); host `<id>.rds.localhost.floci.io:5432`, which resolves to 127.0.0.1 on the host too. `GET /identity` (one read, a pool per invocation) 34 to 40 ms over ten requests, `GET /health` 7 to 8 ms. A pool per environment was not built |
  | 6 one function, three queues | passes | each queue's batch reached its own handler by `eventSourceARN`; a record in `batchItemFailures` came back alone after 91 s (the visibility timeout was 90 s), a defect redelivered its whole batch |
  | 7 the bindings | passes | `QueueSender` built over `AWS.SQS.SendMessage` type-checks and sends (`deployment/probe/app/Bindings.ts`); put, head, get, a 5 MiB multipart, abort, delete and a presigned GET ran from a function, and the presigned URL (`http://localhost.floci.io:4566/…`) opened from the host. `S3Bucket` itself was not rebuilt over them |
  | 8 settings | passes | a `Config` read in construction reaches the function; unset, the deploy fails at once with `ConfigError`; a default is not bound and applies at runtime. Every bound value, a `Config.String` too, is `{"_tag":"Redacted","value":"…"}` in plain text. `AWS_REGION` read in construction did not fail the create on floci and was not bound; real AWS not checked |
  | 9 our services in construction | passes | `Layer.build` of the repositories, `Db`, `Transaction` and the use cases in construction; `Queues` yielded by the api, the worker and the stack kept one id each |
  | 10 two databases on port 5432 | passes for two stages | the Aurora cluster of `probe_rds` and the instance of `probe_app` answered at once, told apart by host name. Two worktrees as such were not run |
  | 11 the e2e | passes, slower than today | a floci of its own on a free port: ready in 0.6 to 1.0 s, three queues and a bucket in 45 ms, stopped in 0.13 s. `beforeAll(deploy(Stack))` with `dev: true` under `vitest` on Node (`journey.probe.ts`): 22.8 s on a new stage, 14.7 and 15.0 s on an existing one, about 6.5 s of it the import. Today: the whole run 87 tests in 5.0 s, its two journey files (10 tests) 4.0 s |
  | 12 the web | half | `StaticSite` with `dev.command` ran the web's Bun server and the `Router` served its page at `http://localhost:9500`. **`/api/*` to the Function URL fails on floci**: 502, `BlockedOriginHostException: CloudFront origin host resolves to a blocked address` |
  | 13 `.alchemy/` and the logs | passes | `.alchemy/` is `path.resolve('.alchemy')`, the working directory (`alchemy: AlchemyContext.ts:35-46`, read, not run with `--config`); `alchemy logs --stage <stage> -r <Id> --since 5m` prints a dev function's log |
  | 14 a silent model call | fails as it stands | Node 24's `fetch` ends a response silent for 301 s: `UND_ERR_HEADERS_TIMEOUT` before the headers, `UND_ERR_BODY_TIMEOUT` between chunks; an `AbortSignal.timeout` of 600 s changes neither. The reply needs a dispatcher with its own timeouts |

- [A:ai] **Today beside Alchemy, measured in the same tree:**

  | What | Today (`make up`, `bun --watch`) | Alchemy on floci |
  |---|---|---|
  | the stand up, first time | 9.6 s | 27.5 s |
  | the stand up, again | 2.8 s | 9.1 s |
  | an edit to the next response | 0.31 s | 2.1 to 2.6 s |
  | `GET /health` | 0.7 to 0.9 ms | 7 to 8 ms |
  | `GET /identity`, one database read | 1.7 to 4.2 ms | 34 to 40 ms |
  | the journeys of `apps/e2e` | 4.0 s for both files | 14.7 s for one file on a deployed stage |
  | the in-process e2e's emulator | (MiniStack, not timed apart) | floci ready in 0.6 to 1.0 s |

- [A:ai] **What the run met that no note named:**
  1. A function's memory defaults to 128 MB (`aws: Lambda/Function.ts:272-277`). The api's
     function died on its first database request with no log line and a 502; at 1024 MB it
     runs.
  2. `migrationsTransport: "direct"` needs the `pg` package beside `@alchemy.run/sql`, its
     optional peer: without it the deploy fails with `Failed to load the 'pg' driver`.
  3. Under this repo's `exactOptionalPropertyTypes`, `domain: { router }` and
     `{ url: api.functionUrl }` of `AWS.Website` do not type-check; they run.
  4. The stack ran under Node: the failing import's frames are `node:internal/modules/esm` and
     `@alchemy.run/node-utils/lib/loader/hooks.js`.
  5. Each start of `alchemy dev` plans the functions as `update` with nothing changed.
  6. The `aws-lambda-httpapi` example's `GET /?jobId=<a created id>` answers 500 with no body;
     not looked into, the repo has no DynamoDB.

#### Today's stand

- [A:ai] `make up` runs Pulumi (`deployment/`, about 330 lines): a MiniStack per worktree on port
  `4566 + 10N`, S3, SQS, an RDS instance as a Postgres container. The api and the worker run on
  the host under `bun --watch`; MiniStack's proxy mode POSTs each SQS batch to the worker's
  `/events`. The worker's function in `deployment/aws/worker.ts` is a stand-in; no AWS stack
  exists. The e2e run starts its own Postgres and MiniStack containers and each test provisions
  its stage through the SDK (`kernel/data/__tests__/testing/e2e/e2e.test-setup.ts`,
  `apps/e2e/testing/stand.test-layer.ts`).
- [A:ai] **Under Node, measured in this worktree:**
  - `bunx vitest run --project unit` (no `--bun`): 214 of 237 pass; the 23 failures are four
    files, the api's three handler suites and the worker's, all `ReferenceError: Bun is not
    defined` from the Bun HTTP server's test layer.
  - `bunx vitest run --project e2e`: 77 of 87 pass in 7.01 s (6.09 s under Bun, one run each);
    the 10 failures are `apps/e2e/api/chat.e2e.ts` and `identity.e2e.ts`, which go through the
    stand (their error text was not read).
  - `effect-tsgo -b` with `types: ["node"]`, `@types/node` 24 and the four entry files on
    `@effect/platform-node`: two errors, both expected. `apps/web` wants `types: ["bun"]` of
    its own (tried: it passes), and `apps/e2e/testing/stand.test-layer.ts` finds a free port
    with `Bun.listen`.
  - A file in `deployment/` importing the api's layer and Alchemy type-checks, with
    `HttpRouter.toHttpEffect(ApiHttp)` and a `Stack`; `make lint` refuses that import
    ("deployment imports no workspace but packages/* and of the kernel /config, /aws and
    /data").
  - Rolldown with Alchemy's options (an agent's run, the script not kept): the worker's handler
    bundles to 1.02 MB in 158 ms with nothing unresolved; the api's and the worker's `layer.ts`
    bundle but leave `import 'bun'` from `@effect/platform-bun`. The Bun platform must stay out
    of a function's graph.

#### Alchemy's function, as its source reads

- [A:ai] **Two scopes** (`aws: Bootstrap/Lambda.ts`, `alchemy: Platform.ts`, `aws:
  Lambda/Function.ts` near 1480). Construction runs once per execution environment, its scope
  closed on SIGTERM, best effort. Each invocation has a scope of its own, closed before the
  handler returns.
  - **A layer given by `Effect.provide` on the function's construction is torn down when
    construction returns**: `Effect.provide(layer)` builds into a scope that closes with the
    effect (`effect: internal/layer.ts`; Alchemy says so of its own class layer,
    `alchemy: Platform.ts:54`). A Postgres pool provided so is closed before the first request.
    A service that must live for the environment is built into the ambient scope
    (`Layer.build`, or inside the layer `HttpRouter.toHttpEffect` builds). A binding's layer
    (`SendMessageHttp`) holds no finalizer, so providing it that way is fine.
  - At `timeout` the handler is interrupted and its finalizers run; Lambda itself gets
    `timeout + timeoutMargin` (1 s by default).
  - The docs warn: no work after the response, nothing disposable across a freeze, "Design so
    nothing needs instance-level cleanup" (`infrastructure-as-effects/runtime`).
- [A:ai] **Serving the `HttpApi`** (`alchemy: Http.ts`, `effect: http/HttpRouter.ts:695`,
  `repos/alchemy/examples/aws-lambda-httpapi/src/`). The construction returns `fetch`, an effect
  that may need only the request, a scope and the platform's services. The documented way is
  `HttpRouter.toHttpEffect(HttpApiBuilder.layer(Api).pipe(…))` with `Http.Platform` (an `Etag`,
  a stub `HttpPlatform`, `Path`, a no-op `FileSystem`) provided.
  - What our handlers read per request (the use cases `apps/api/layer.ts` provides after
    `serve`) stays a requirement of the returned effect, which `fetch`'s type refuses: it is
    provided to that effect as a built `Context`.
  - `toHttpEffect` adds no request logger (`HttpRouter.serve` does); Alchemy adds a tracer.
  - Cookies survive: the event's `cookies` are joined into a `cookie` header and `Set-Cookie`
    goes out as the event's `cookies` (`aws: Lambda/HttpServer.ts`). **Corrected by L1's run:** a
    cookie set by `HttpApiBuilder.securitySetCookie` is lost. It is written by a pre-response
    handler (`effect: http-api/HttpApiBuilder.ts:635-648`), which only `HttpEffect.toHandled`
    applies (`effect: http/HttpEffect.ts:53`), and Alchemy runs `fetch` without it
    (`alchemy: Http.ts:76`): the function's own payload carried no `cookies`. With `fetch`
    wrapped in `HttpEffect.toHandled` the `Set-Cookie` arrives and the identity reads back. A response is buffered whole,
    6 MB at most, unless the Function URL's `invokeMode` is `RESPONSE_STREAM`.
  - The bootstrap provides Node's services, a fetch client and a random source, but no `Digest`,
    which `IdentityService` reads: `NodeCrypto.layer` of `@effect/platform-node` gives it.
- [A:ai] **Bindings** (`aws: SQS/`, `aws: S3/`). One exists for every operation the repo calls:
  `AWS.SQS.SendMessage(queue)`, and `AWS.S3.<Op>(bucket)` for the multipart four, `PutObject`,
  `GetObject`, `HeadObject`, `DeleteObjects` and `PresignGetObject`; each needs its `<Op>Http`
  layer while the construction runs and nothing at runtime, and writes the IAM statement and
  the environment variable. `GetQueueUrl` is no longer called. So `@effect-aws/client-*` leaves
  the functions' graph. A presigned URL is signed against `AWS_ENDPOINT_URL`, which in a dev
  container is the container's view of floci (check 7).
- [A:ai] **Postgres** (`aws: RDS/Connect.ts`, `aws: RDS/ConnectHttp.ts`, `sql: Postgres.ts`,
  `repos/alchemy/examples/aws-rds`). `AWS.RDS.Connect(instance, { database })` returns an effect
  that reads the managed secret each time it runs and gives `{ host, port, url, … }`; its URL
  carries `sslmode=no-verify`. Alchemy's own `SQL.PostgresLayer({ url })` provides `PgClient` and
  `SqlClient` from a pool opened at most once per invocation and closed when it settles, and
  works under Drizzle's Effect driver. **Confirmed and sharpened by L1's run:** the layer is
  built once, in construction (`sql: Postgres.ts:96-103`); only the pool behind it opens per
  invocation. So the repositories and the services over it are built once too.
  - `@effect/sql-pg` 4.1.5 speaks the protocol over `node:net` itself: no native module.
  - floci serves real Postgres containers; version 18 is in its catalogue, 16 its default. The
    repo's migration needs 18.
  - `DBInstance.migrations` takes a folder; drizzle-kit's `<14 digits>_<name>/migration.sql`
    layout, the repo's, is one it detects (`sql: Migrations/Detect.ts`); `migrationsTransport:
    "direct"` runs them from the deploying machine.
- [A:ai] **The SQS consumer** (`aws: SQS/QueueEventSource.ts`, `aws: Lambda/QueueEventSource.ts`).
  `AWS.SQS.consumeQueueMessages(queue, props, handler)` grants the three SQS actions and creates
  the mapping, `ReportBatchItemFailures` by default, `batchSize` 10.
  - **A listener does not look at the queue**: it takes any SQS event, and the first listener
    that answers wins. One function on three queues needs one handler that routes by
    `eventSourceARN`, as `apps/worker/worker.handler.ts` does today.
  - **The handler's requirements are dropped from the type** and it runs against the bootstrap's
    context: its services are provided on the handler itself, or it fails at runtime with a
    missing service the compiler never names.
  - The queue's visibility timeout is at least `timeout + timeoutMargin`: the inventory's 600 s
    for both leaves no margin. `maximumConcurrency` is a prop of the `EventSourceMapping`
    resource alone.
  - Our `SqsBatchResponse` holds a readonly array where `aws-lambda`'s type wants a mutable one.
- [A:ai] **Settings** (`alchemy: Platform.ts:558`, `environments/secrets`). A `Config` read while
  the construction runs, layers built there included, is bound to the function as a secret; one
  first read in a handler is not. The bound value is the source's, never a default: `NODE_ENV`
  unset at deploy leaves the cookie without `Secure`. In beta.87 a secret sits in the function's
  configuration as plain text. A function's `env` prop takes a whole record. `awsConfig` reads
  `AWS_REGION`, a key Lambda reserves (from memory): it stays out of construction.
- [A:ai] **Telemetry** (`alchemy: TelemetryRuntime.ts`, `infrastructure-as-effects/telemetry`).
  Alchemy exports per invocation and flushes before the handler returns, to the standard
  `OTEL_EXPORTER_OTLP_*` variables or `Alchemy.Telemetry.layerOtlp`. Our
  `Otlp.layerFromConfig`, built in construction, would batch across a freeze and lose spans.
  Logs go to stdout by the bootstrap's own logger; our minimum log level applies only when
  provided inside the handlers.
- [A:ai] **The dev loop** (`cli/dev`, `aws: Lambda/FlociFunctionProvider.ts`). `alchemy dev`
  re-runs the stack under `bun --watch`: a save in any file the stack imports restarts it and
  re-plans. **Corrected by L1's run:** a save in `application/` or an app swapped the
  function's code with no re-plan; a save in a file of the stack itself re-planned in 0.4 s. The function's own watch rebuilds its bundle and floci swaps it, 100–500 ms by the
  docs. Issue 3565 (a needless update per reload) does not hit zip functions by its own text.
  An inspector in a function's container is in no doc.
- [A:ai] **Tests** (`repos/alchemy/packages/alchemy-test/src/`, `testing/test-harness`).
  `Test.make({ providers, dev: true })`, `beforeAll(deploy(Stack))`, the outputs as the test's
  values; the stage is `test_$USER`, in a worktree `test_$USER_<worktree>`. `deploy` takes any
  Stack value, but a function's code is the default export of its `main` file: a worker with a
  scripted assistant is a second function file.

#### floci

- [A:ai] One per machine: the port `4566` and the name `alchemy-floci` are fixed
  (`aws: AuthProvider.ts:58`, `aws: Local/Floci.ts`); a floci already on the port is used as is;
  Alchemy never stops it. Its state is in memory: a Docker restart drops every stage's resources
  (alchemy issue 2724, open).
- [A:ai] The SQS mapping polls each second with no receive wait and hides in-flight messages for
  the function's timeout plus about 30 s; at most 4 containers per function; containers stay
  warm for 300 s. Every database sits behind host port 5432, told apart by the TLS server name.
  About 140 service folders, `cognito` and `cloudfront` among them; their fidelity unchecked.

#### Alchemy's conventions

- [A:ai] From its guides, examples and `AGENTS.md`:
  1. The stack's file is the composition root alone: the name, the providers, the state, the
     outputs. The CLI's default is `alchemy.run.ts` at the working directory, `--config <file>`
     any other (`alchemy: Cli/commands/flags.ts`).
  2. "one file per Resource or Layer, group Resources that travel together"; a declaration is
     inert until yielded and memoized by its id; PascalCase modules and ids.
  3. A resource a producer and a consumer share has a module of its own; a per-stage setting
     sits beside its resource, read from `Stack`.
  4. No physical names: Alchemy generates them and tags each resource with its stack, stage and
     id; an explicit name appears only to adopt what exists.
  5. Runtime code reaches a resource through a binding. A service of one's own is a
     `Context.Service` whose layer yields resources and bindings; `Layer.provideMerge` for a
     composite over binding layers, `Layer.mergeAll` for independent ones (`aws: AGENTS.md`).
  6. A consumer sets `functionUrl: false`: left out, a function gets a public URL.
  7. `Config` is read in construction; state: `AWS.state()` for shared stages,
     `Alchemy.localState()` (`.alchemy/`, gitignored) locally; the stage from `--stage`, then
     `ALCHEMY_STAGE`, then `dev_$USER` or `live_$USER`; a worktree derives its own.
  8. Removal is `destroy` by default, `RemovalPolicy.retain` beside the resource; a renamed id
     replaces unless piped through `Alchemy.renamedFrom`.
  9. The web: `Website.StaticSite` with `build` and `dev`, `Website.Router` for `/api/*`.
  Between beta.87 and `main` on 2026-11-28: 235 commits, five breaking (secret env to SSM, state
  encryption, masked `state read`, deletion protection refused, distilled pinned to `main`), and
  `ALCHEMY_DEV` false under `Test.make` in beta.87, so the stack reads `AlchemyContext.dev`.

#### The design

- [D:ai] **For the owner to accept, change or refuse after L1.** One mode: `alchemy dev` runs on
  floci what `alchemy deploy` runs on AWS.

  ```
  browser ──▶ web (its dev server on the host; a site once built)
  web ──/api/*──▶ Router ──▶ Function URL ──▶ Api (Node 24, zip)
  Api ──SendMessage──▶ queue ──batch──▶ Worker (Node 24, zip) ──▶ the model
  Api, Worker ──SQL──▶ Postgres 18        Api ──▶ the bucket
  ```

  ```
  deployment/
    alchemy.run.ts      the Stack: providers, state, the units yielded, the outputs
    Queues.ts           each queue with its dead-letter queue
    Files.ts            the bucket and its lifecycle rule
    Database.ts         the Postgres instance and its migrations
    Web.ts              the site and its router
    Telemetry.ts        the telemetry backend's container, in dev alone
    Api.ts              the api's function: bindings, layers, `fetch`
    Worker.ts           the worker's function: bindings, layers, one handler over the queues
    Bindings.ts         our queue and file services built from Alchemy's bindings
  ```

  All of Alchemy sits in `deployment/`; `apps/`, `application/`, `kernel/` and `packages/` import
  none of it. The functions' classes are here, not beside the apps as Alchemy's examples have
  them: they import the apps' routes and layers and provide them. The `make` targets run
  `bun alchemy <command> --config deployment/alchemy.run.ts` from the root; every path in the
  stack is anchored with `import.meta.dirname`.

- [D:ai] **Effect wires it**, by this repo's own rules (`effect-style.md`, `effect-services.md`,
  `composition.md`). Each use removes a way to get the stack wrong; one that removes none is
  not written.

  | Effect's means | What it holds | The mistake it removes |
  |---|---|---|
  | a layer per service of ours, built from a binding (`Bindings.ts`) | `QueueSender` and `S3Bucket` over `AWS.SQS.SendMessage` and `AWS.S3.<Op>` | a second client and hand-written IAM; the apps learning of Alchemy |
  | `Layer.build` into the construction's scope | what lives for the environment (the services, the model's client) | a layer torn down before the first request |
  | `SQL.PostgresLayer`, built once in construction (corrected by L1's run: not per invocation) | the Postgres client, whose pool opens per invocation | a socket dead after a freeze |
  | `Layer.provideMerge` over the binding layers | the construction's `<Op>Http` layers | a binding without its layer, found at deploy |
  | `Config` read while layers are built in construction | the model's key and names, the log level, `NODE_ENV` | a setting the function never receives |
  | one handler over a table `as const satisfies Record<QueueName, …>` | the worker's routes by queue | a queue with no handler; a batch run by the wrong one |
  | `Duration.sum` | the queues' visibility timeout from the worker's timeout and its margin | AWS refusing a mapping when one number changes alone |
  | `Effect.fn('<Unit>.<step>')` and errors in one tail | each declaration unit and each function's construction | a failed deploy that names no unit |

  A sketch, not compiled, each name from the sources above:

  ```ts
  // deployment/Api.ts
  export default class Api extends AWS.Lambda.Function<Api>()(
    'Api',
    { main: import.meta.url, functionUrl: true, timeout: Duration.seconds(30) },
    Effect.gen(function* () {
      const connect = yield* AWS.RDS.Connect(yield* Database, { database })
      const services = yield* Layer.build(
        ApiServices.pipe(Layer.provide([QueueSenderFromBindings, FilesFromBindings])),
      )

      const routes = yield* HttpRouter.toHttpEffect(
        ApiRoutes.pipe(Layer.provide(Http.Platform)),
      )
      return { fetch: routes.pipe(Effect.provide(services), providePostgres(connect)) }
    }).pipe(Effect.provide(BindingLayers)),
  ) {}
  ```

  ```ts
  // deployment/Worker.ts — one handler for every queue, its services provided on it
  const handle = (event: SQSEvent) => routeByQueue(event).pipe(Effect.provide(services))
  yield* Effect.forEach(queues, (queue) => AWS.SQS.consumeQueueMessages(queue, handle))
  ```

- [D:ai] **What changes in the repo, by file:**

  | Today | Its fate |
  |---|---|
  | `apps/api/layer.ts`, `main.ts` | the routes and the services layer stay, exported; the Bun server, the `Otlp` layer and the process entry go |
  | `apps/worker/layer.ts`, `worker.handler.ts`, `main.ts` | `POST /events` becomes a plain router `(event) => Effect`; the server and the entry go |
  | `packages/aws/queue`, `packages/aws/s3` | `QueueSender` and `S3Bucket` take their operations as functions, so the SDK's client and Alchemy's bindings both feed them |
  | `kernel/aws` (the inventory, `ResourceName`, the `@effect-aws` clients) | the inventory becomes the declarations of `deployment/`; the naming rule and the clients leave the functions' graph |
  | `kernel/llm`'s ten-minute `fetch` timeout | a Node equivalent (check 14) |
  | `kernel/postgres/postgres-migrate.ts`, `make migrate` | the instance's `migrations`, if check 5 passes |
  | the test layers on `BunHttpServer`, the stand's `Bun.listen` | their Node counterparts; `vitest` runs without `--bun` |
  | `deployment/aws/*.ts`, `deployment/local/*`, `deployment/shared/tags.ts` | deleted with Pulumi and MiniStack |
  | `STAGE`, `.env.pulumi`, `API_PORT`, `WORKER_PORT`, `RDS_BASE_PORT`, the emulator's port per tree | `ALCHEMY_STAGE`; a function has an address of its own |
  | `make up`, `make dev`, `make debug-<app>` | `make dev` runs `alchemy dev`; `make deploy` beside it; the debug targets as check 13 finds |

  Bun stays the package manager, the scripts' runtime and the web's dev server: `apps/web` keeps
  `types: ["bun"]`.

- [D:ai] **The rules this crosses**, by the owner's word in Knowledge, each rewritten at L5:
  `deployment` importing the apps and `application/` (`architecture.md › Dependency rules`,
  `biome-imports.grit`, which `make lint` showed refusing it); the inventory's naming rule
  (`aws.md › The inventory`) and `deployment/CLAUDE.md`'s line on it; the file-naming rule, for
  PascalCase modules; "settings are read only through `kernel/config`" where a function's
  construction must read a `Config` to bind it.

- [Q:ai] Choices the probe's numbers should decide, each with a first proposal:
  - **The pool:** per invocation, Alchemy's documented way (a secret read and a TLS handshake
    per request), or per environment (cheaper; sockets cross a freeze, against its docs). First:
    per invocation, timed by check 5.
  - **The worker's routing key:** the queue's ARN from its declaration, or explicit queue names
    so today's routing by name stands. First: the ARN, as Alchemy names the queues.
  - **The scripted assistant in a journey test:** a second function file in `deployment/` for
    the test's stack, or one file choosing the layer by a `Config`, which ships the script to
    production. First: the second file.
  - **Telemetry:** Alchemy's exporter through the `OTEL_*` variables, or our `Otlp` layer handed
    to `Alchemy.Telemetry.layer` with its intervals off. First: Alchemy's.

- [N:ai] Set aside this day, with why, so no step reopens them unasked: Bun in the deployed
  processes (an image function has no watch and no bindings; host processes need a forwarder
  function; a Bun layer on `provided.al2023` is a hack) — see Later for the way back; ECS on
  Fargate (Alchemy's Bun path: not Lambda, never at zero, about 6 s per edit); Lambda Web
  Functions (Node and Python, HTTP alone, no worker); Cloudflare (no Postgres of its own, every
  entry and client rewritten); MiniStack beside Alchemy (the owner's word).

Sources beyond the vendored tree: `https://github.com/alchemy-run/floci`, alchemy issues 2724,
3288, 3427, 3565 and PRs 3328, 3664, 3668, 3741,
`https://docs.aws.amazon.com/lambda/latest/dg/runtimes-customer-managed.html`,
`https://coldstarts.github.nimmervoll.work/`.

### Output

**Go, on the owner's word after the numbers** ("ok, lets continue and them will improve
performance"). Twelve of the fourteen checks pass, check 12 by half, check 14 not as it stands;
the table, with each number and today's beside it, is [The probe's run](#the-probes-run). The
notes above stay in the file, against a close's habit: the Map sends every later step to them.
The draft stays in `.claude/worktrees/alchemy-probe` for the performance work.

What the later steps carry from it:

1. The Postgres layer and every service over it are built once, in construction; the pool
   alone opens per invocation.
2. `fetch` is wrapped in `HttpEffect.toHandled`, or the identity's cookie is lost (a
   proposal, [L3's notes](#l3-notes)).
3. The functions name their `memorySize`: at the default 128 MB the api dies with no log.
4. `deployment` depends on `pg` for the migrations' direct transport.
5. The web's `/api/*` cannot go through the `Router` on floci.
6. A reply's call to the model needs its own idle limit on Node: `fetch` ends at 301 s.

The proof, condensed from the probe's `Api.ts`, which type-checked and ran (`handled` stands
for its `HttpEffect.toHandled` wrapper):

```ts
const connect = yield* AWS.RDS.Connect(yield* Database, { database: databaseName })
const Postgres = SQL.PostgresLayer({ url: Effect.map(connect, ({ url }) => url) })
const infrastructure = Layer.succeedContext(yield* Layer.build(Infrastructure))
const useCases = Layer.succeedContext(
  yield* Layer.build(ApiUseCases.pipe(Layer.provide(infrastructure))),
)
const routes = yield* HttpRouter.toHttpEffect(
  ApiRoutes.pipe(Layer.provide([infrastructure, useCases]), Layer.provide([HttpPlatform.layer, Etag.layer])),
)
return { fetch: handled(routes).pipe(Effect.provide(useCases)) }
```

Can you write the signature now?

## L2 — The api and the worker on Node

### Shape

The five pieces of the notes below, accepted by the owner's "ok" (2026-11-28).

### Notes

- [D] **The Shape, five pieces, each green alone** (the owner's "ok", 2026-11-28). Bun stays the launcher of
  `make dev` until L3 (`bun --watch main.ts` runs `@effect/platform-node` too, I assume; the
  first piece shows it), so the stand plays after every piece.
  1. **The api's routes apart from its process.** `apps/api/layer.ts` exports `ApiRoutes` (the
     `HttpApi`'s layer with its handlers and middlewares) and `ApiUseCases`, neither naming a
     server; `ApiLayer` serves them through `NodeHttpServer` and provides `NodeCrypto`. Test:
     the three handler suites, their test layer on `NodeHttpServer.layerTest`.
  2. **The worker's route as a function.** `apps/worker/worker.handler.ts` exports
     `(event: SqsEvent) => Effect<SqsBatchResponse, never, JobServices>`, keyed as today; the
     `POST /events` that calls it stays in the worker's `layer.ts` until L3. Test:
     `worker.handler.test.ts` calls the function, with no server.
  3. **`QueueSender` takes its send.** `QueueSender.layer(send)` where
     `send: (queueName: string, message: { body: string; traceparent: string }) =>
     Effect<void, QueueError>`; `kernel/aws` builds today's from `SQSService` and the queue's
     URL, L3 from `AWS.SQS.SendMessage`. Test: the sender's suite, on a `send` that records.
  4. **The tests on Node.** `vitest` without `--bun`; `types: ["node"]` and `@types/node`, the
     web keeping `types: ["bun"]`; the stand's `Bun.listen` becomes `node:net`; the test layers'
     `BunCrypto`, `BunFileSystem` and `BunPath` their Node counterparts. Check: `make check`.
  5. **The model's idle limit on Node.** `kernel/llm` gives the client a dispatcher whose
     headers and body timeouts are ten minutes, in place of Bun's `timeout`. Test first: a
     server silent past the default, which fails today under Node.
- [D] **`S3Bucket` stays as it is in this step** (the owner's "ok"). No process provides it
  (`docs/knowledge/decisions.md › Clients from the context`), so rebuilding it over operations
  changes nothing a run shows; without it the system loses nothing until a module stores
  files. It goes to Later.
- [N:ai] **The review of L2** (the rounds L2.1 to L2.6; Intent, Hunt and Rules, 2026-11-28)
  found that three of the accepted pieces were built otherwise and defended in commit messages
  alone. Each is a proposal below until the owner makes it a `[D]`; the pieces' lines above stay
  as the owner accepted them.
- [D:ai] **The launcher is Node already** (`apps/api/package.json:13`,
  `apps/worker/package.json:13`), against "Bun stays the launcher of `make dev` until L3".
  Shown: the undici client the worker needs dies under Bun 1.4.5 with `dispatcher.destroy is
  not a function` (L2.6). Kept, the api restarts on an edit in about 0.9 s against 0.31 s, and
  Node stops on a missing `.env.pulumi` where Bun went on. Reverted, the worker runs
  under Bun on `fetch` and its replies have no working idle limit until L3. Proposed: keep Node.
- [D:ai] **The model's call has no idle limit and no test of one**
  (`kernel/llm/llm.client.ts:16`, `apps/worker/layer.ts:52`), against piece 5's ten-minute
  dispatcher and its test. Shown: through `NodeHttpClient.layerUndici` a response silent for
  310 s arrives; the client sets 60 minutes for the headers and nothing for the body
  (`@effect/platform-node` `NodeHttpClient.ts:221-222`). Claimed by the Hunt pass: a model that
  accepts the connection and never answers holds a local reply for up to 60 minutes, and SQS
  hands the message out again once its visibility timeout passes; deployed, the function's
  timeout ends it. Options: none, as now; `Effect.timeout` of the worker's timeout on the
  call, one line and one test with `TestClock`. Without it the local worker alone can hold a
  reply for an hour. Proposed: the `Effect.timeout`, as the hard pass's item.
- [D:ai] **The SQS transport is `QueueSender.layerSqs` in `packages/aws/queue`**
  (`packages/aws/queue/queue.sender.ts:42`), against piece 3's "`kernel/aws` builds today's".
  It needs `QueueClient` and the SQS request's shape, both of that package; in `kernel/aws` the
  kernel would hold an SQS request. Proposed: keep it in the package.
- [D:ai] **`Equal.equals` on errors: the ban's reason is gone on Node**
  (`.claude/rules/effect-tests.md:71`, `docs/knowledge/tooling.md:136`,
  `packages/testing/schema.test-util.ts:7`). Shown: a one-off test compared two equal
  `Schema.TaggedError`s 200 000 times; under `bunx vitest` none differed, under
  `bun --bun vitest` the test failed. Options: keep `assertSchemaEquals` as the one way and
  reword its reason (it still gives a diff by field); lift the ban. Proposed: keep it,
  reworded, in this lab's close.
- [N:ai] Rejected: the `orDie` on a missing `traceparent` in `QueueSender.send` (it cannot
  fire, `effect: http/HttpTraceContext.ts:52`, and stands beside the same `orDie` on the
  current span; the other spelling is an optional field on the transport's message); a unit
  test for `POST /events` (the journeys of `apps/e2e` run it, and L3 deletes the route);
  `Effect.fn.Return` on `consumeEvent` (after L2.7 it fails with nothing and its result is
  inferred from the routes' table).
- [N:ai] The decisions this step rewrites: none reversed. `Clients from the context` holds
  (the kernel still builds the clients); `Independent apps` holds until L3, where `deployment`
  imports the apps by the owner's word in Knowledge.

## L3 — One stack in `deployment/`

### Notes

<a id="l3-notes"></a>

- [D] **The cookie: the wrapper, and an issue upstream** (the owner's "ok", 2026-11-28). Alchemy runs `fetch` bare, so `securitySetCookie`'s pre-response
  handler never runs (L1, check 4). Options: wrap `fetch` in `HttpEffect.toHandled` in
  `deployment/Api.ts`, eight lines of Effect's public API, the way Effect's own servers run a
  handler; or set the cookie on the response in the handler, which the `HttpApi`'s typed
  handlers do not offer. Proposed: the wrapper, and an issue upstream. Without it no user is
  recognised twice.
- [D] **The web in dev: its own proxy stays** (the owner's "ok", 2026-11-28). floci's CloudFront refuses the Function URL as an origin (L1,
  check 12). Proposed: the web's own `/api/*` proxy stays, pointed at the Function URL; the
  `Router` route is declared for a deploy and rechecked on a floci bump.

## Knowledge

- [D] The api and the worker run as Alchemy's Effect functions on Node.js 24, zip-packaged
  ("ok. lets try node", the owner, 2026-11-28, replacing their earlier word of the same day for
  Bun). Bun stays for installing, the scripts and the web's dev server.
- [D] Go after the probe: the stack is built on Alchemy and floci as measured, slower than
  today's stand, and its speed is improved after the feature plays ("ok, lets continue and them
  will improve performance", the owner, 2026-11-28).
- [D] One description, one mode: what `alchemy dev` runs on floci, `alchemy deploy` runs on AWS.
- [D] Alchemy and everything of it lives in `deployment/` ("all should be inside deployment").
- [D] The Alchemy code is wired with Effect's core: layers, services, `Config`.
- [D] With Alchemy the only emulator is floci; MiniStack stays in no part, the e2e included.
- [D] No hacks: nothing that works around Alchemy or floci.
- [D] The hosting is AWS, on Lambda.
- [D] The e2e keep their two kinds (the owner's "ok", 2026-11-28). The in-process ones (the
  adapters' and the services') stand on a floci container of their own per run, started and
  stopped by testcontainers on a free port, their resources made through the SDK and a database
  copied from the template per test, as today with MiniStack. The journeys of `apps/e2e` run
  through the deployed stack: `beforeAll(deploy(Stack))` of Alchemy's test harness with
  `dev: true`, on the shared floci, in the stage the harness derives from the worktree, driven
  over the api's Function URL.
- [D] The configuration is written the way Alchemy recommends. Where that meets one of this
  repo's rules, the rule may be broken for now ("If needed breake the rules for now"); each
  break is named in the step that makes it, with the rule or guard it crosses, and the rule is
  rewritten at this lab's close.
- [D] Alchemy's repository is vendored in `repos/alchemy` at the catalog's pin
  (`make vendor-alchemy`), and `.claude/rules/alchemy.md` says where to look in it; the lab's
  notes are leads each step rechecks there.

## Later

- **Reminder: AWS opened a way to run Bun on Lambda as a zip function; check it at this lab's
  close.** Customer-managed runtimes (GA 2026-11-18) run a zip Event Function on a runtime image
  from ECR, and the launch post names Bun: with them the functions of this lab could move back
  to Bun by their `runtime` alone, keeping the bindings and the hot swap. What to check:
  1. `npm view alchemy dist-tags`: a release past `2.0.0-beta.87` that ships PRs 3664 and 3668
     (`AWS.Lambda.Runtime`, `RuntimeAlias`, and their run on floci).
  2. Whether its `runtime` contract still reads "its image must provide Node.js and the Node.js
     runtime interface client", or admits a Bun image.
  3. A Bun runtime image to stand on: `@beesolve/lambda-bun-runtime` v4 (one star on 2026-11-28),
     or an official one from Bun or AWS.
  4. Bun's `oven-sh/bun` issue 47213 (the same random values in clones of one snapshot) before
     any use of SnapStart.
  Until 1 and 2 hold, this path is a hack by the owner's rule and stays out — after a release
  past `2.0.0-beta.87` — open
- A secret is plain text in a function's configuration in beta.87 (`aws: Lambda/Function.ts`,
  the env's packing); `main` moves it to SSM (PR 3741) — the next Alchemy bump — open
- Total database connections under load: a pool per environment times the environments; RDS
  Proxy is the docs' answer — `aws-deployment` — open
- `NODE_ENV` must be set where the stack is deployed, or the cookie loses `Secure`
  (`apps/api/identity/identity.handler.ts`) — L3 — open
- **Speed, after the minimal pass** (the owner's word): an edit to the next response 2.1 to
  2.6 s against 0.31 s; a request with one database read 34 to 40 ms against 2 ms (a pool per
  environment was not measured); a journey file 14.7 s on a deployed stage against 4.0 s for
  both today; the stand's start 9.1 s against 2.8 s — [The probe's run](#the-probes-run) — open
- `kernel/postgres/postgres-migrate.ts` still runs on `BunRuntime`, a script `make migrate` starts
  with Bun; it goes with `make migrate` when the instance's `migrations` replace it — L3 — open
- `docs/knowledge/tooling.md › Tests` says errors are compared by their encoded form because
  "under Bun two errors with equal fields differ at random"; whether Node shows it was not
  run — this lab's close — open
- The api's restart on an edit under `node --watch` takes about 0.9 s (three runs: 0.91, 0.92,
  0.96 s) against 0.31 s under `bun --watch`; it joins the speed item above — L2 — open
- `make debug-api` and `make debug-worker` both take Node's inspector port 9229, so one runs
  at a time (`apps/api/package.json`, `apps/worker/package.json`) — L3, where the debug targets
  are redrawn — open
- No test holds the model's client to a response silent past 300 s: it would take five
  minutes; the run is in L2.6's message — this lab's close — open
- The stand's `findFreePort` has no `error` listener and leaves its probe open on an
  interrupt, so a failed `listen` hangs the stand until vitest's timeout where `Bun.listen`
  died at once; claimed by L2's review, not run (`apps/e2e/testing/stand.test-layer.ts:18`) —
  L4, where the stand is redrawn — open
- The import guard lets a module's service test import the whole `@effect/platform-node`
  index, `NodeHttpServer` and `NodeHttpClient` with it, as it let Bun's
  (`.misc/lint/biome.base.json:307`) — this lab's close — open
- `S3Bucket` over operations a binding can feed, when a module stores files
  (`packages/aws/s3/s3.client.ts`) — L2's notes — open
- `make debug-<app>`: an inspector inside a floci function's container was not looked at —
  L3 — open
- The telemetry backend's container in dev, and whether a function's spans reach it from a
  container — L3 — open
- A Function URL behind CloudFront with origin access control wants `x-amz-content-sha256` on a
  POST (`docs/knowledge/roadmap.md`, entry 9, the security audit) — `aws-deployment` — open
- The vendored tree is 188 MB and 23,603 files; the doc lint's git call needed a larger buffer
  for it (L0.8). A clone and CI pay for it — this lab's close — open
- The roadmap's "Alchemy in place of Pulumi" and entry 9's facts name MiniStack and Pulumi as the
  local mode: rewrite at this lab's close — L5 — open
