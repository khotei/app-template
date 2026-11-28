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

## Map

| Step | Goal, and how to see it | Pass | Kind | Status |
|---|---|---|---|---|
| L1 | The probe answers go or no-go on the checks below, in a throwaway worktree · visible: a table of what ran and its timings | minimal | learn | todo |
| L2 | The api and the worker run on Node and no longer need Bun's server: their routes and services stand apart from the process wiring, the queue and file services take their operations, the tests run on Node · visible: `make check` green with `vitest` on Node | minimal | build | todo |
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
    goes out as the event's `cookies` (`aws: Lambda/HttpServer.ts`). A response is buffered whole,
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
  works under Drizzle's Effect driver.
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
  re-plans. The function's own watch rebuilds its bundle and floci swaps it, 100–500 ms by the
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
  | a layer provided per invocation | the Postgres pool, Alchemy's `SQL.PostgresLayer` | a socket dead after a freeze |
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

## Knowledge

- [D] The api and the worker run as Alchemy's Effect functions on Node.js 24, zip-packaged
  ("ok. lets try node", the owner, 2026-11-28, replacing their earlier word of the same day for
  Bun). Bun stays for installing, the scripts and the web's dev server.
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
- The stack re-plans on every save of a file it imports, the whole of `application/` once
  `deployment/` imports the apps; its cost is check 3 — L1 — open
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
