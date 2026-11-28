# Alchemy stack

Flow: lab · Worktree: `/Users/v/lab/app-template/.claude/worktrees/alchemy-stack` (N=1)

## Intent

The owner's words (2026-11-28), from the session that researched this:

- "I want simple single config which could run it with bun."
- "local dev: host api (http) -> sqs (alchemy), s3 (alchemy), pg (alchemy) -> host worker (http,or
  any possible) ; and local prod (without reload watch) host api lambda -> same -> host local
  lambda (workder) and prod: deployment like local prod but prod"
- "I don't want hacks. I should be simple. Like we have infra configuration as on production."
- "I don't want to use ministack if we will use alchemy"
- "I'd like to stay on aws, because this is well paid skill."
- On the web: "I believe web will be dev server like nextjs, or something like this."
- "could we work with worktree as we did, and run e2e test as we do now?"
- "But do best from perspective of alchymy. Maybe group aws resource which we bould and simmilar
  things with alchymi deployment. Reorganise files if needed. But use lasteet best practices and
  recommendations."
- "I expect best written configuration as it possible from alchemy recommendations."

## Map

| Step | Goal, and how to see it | Pass | Kind | Status |
|---|---|---|---|---|
| L1 | The probe answers go or no-go on six checks, in a throwaway worktree · visible: a table of what ran and its timings | minimal | learn | todo |
| L2 | One `alchemy.run.ts` declares the bucket, the queues and the database on floci, and `make dev` runs api, worker and web on the host over them · visible: `make dev`, a chat message gets its reply | minimal | build | todo |
| L3 | The e2e run stands on floci, no MiniStack · visible: `make test-e2e` green, its duration beside today's | minimal | build | todo |
| L4 | Local prod: api and worker as Lambda functions from one Bun image on floci, the web as a site · visible: `make dev-prod`, the same chat through the Function URL | minimal | build | todo |
| L5 | Pulumi and MiniStack are gone; `aws.md`, `tooling.md` and the worktree rules say what holds · visible: `make check` green | minimal | build | todo |
| L6 | Later: the items of the open list the owner picks | hard | build | todo |

Every step opens by rechecking the notes it builds on against `repos/alchemy`, as
[L1's notes](#notes) say. The steps past L1 are a proposal: L1's Output may redraw them. Deploying to a real AWS account
(a VPC, a private database, IAM roles, secrets, the edge) stays the roadmap's
[`aws-deployment`](../../knowledge/roadmap.md#9-aws-deployment), which builds on this stack.

## L1 — The probe

Reference: Alchemy's own examples, `https://alchemy.run/aws/local-development/` and
`https://alchemy.run/aws/compute/lambda` · Budget: a throwaway stack outside the ticket branch

### Shape

Not written: a learn step. Its draft lives in its own worktree
(`git worktree add -b wt/alchemy-probe .claude/worktrees/alchemy-probe HEAD`, then
`make worktree N=2 NAME=alchemy-probe`), never on this branch.

### Notes

**These notes are leads, not facts** (the owner, 2026-11-28: "during implementatin agent could
recheck ideas by reading and searching inside repos"). They were gathered in one session by
reading, mostly through agents' summaries, and nothing in them was run but the two test runs
under Node named below. So every step that builds on a note opens by checking it:

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

How to find a note's source now that the session's downloads are gone: `aws: <path>` is
`repos/alchemy/packages/aws/src/<path>`, `alchemy: <path>` is
`repos/alchemy/packages/alchemy/src/<path>`, and a guide named by its page (`aws/messaging/sqs`,
`project-structure/file-layout`) is that path under `repos/alchemy/website/src/content/docs/`.
floci is not vendored: its notes cite `alchemy-run/floci` at the tag `2.4.0-alchemy.3`, the
image this Alchemy version pins (`aws: Local/Floci.ts:47`). What each kind of note stands on:

| The notes on | Read from | Trust |
|---|---|---|
| Alchemy's API (props, defaults, the dev providers) | the published packages' source, the same code as `repos/alchemy` | a line number may be off; the claim is likely right |
| Alchemy's conventions | its guides and examples | a guide can lag its source: check the source |
| floci | its source at the pinned tag, by an agent | recheck before relying on a number |
| what others do, the benchmarks, AWS's new runtimes | the web, on 2026-11-28 | dated; recheck before a decision rests on one |
| this repo under Node | two runs in this worktree: `bunx vitest run` without `--bun`, and `effect-tsgo -b` with the Node types | measured |

- [R] The six checks, each with what its failure means:
  1. A Lambda container in floci reaches a process on the host at `host.docker.internal`; a
     forwarder function hands an SQS batch to the worker's `POST /events` and returns its
     `batchItemFailures`; a `500` fails the invoke. Fails → the dev mode below does not exist.
  2. A Bun image with Lambda Web Adapter answers through a Function URL and takes SQS batches in
     floci. Fails → no local prod.
  3. floci started as a container of its own (as the e2e run starts MiniStack) creates a stage's
     queues, bucket and forwarder through the SDK; time per test file beside today's (the e2e
     project of `make check` in this worktree, 2026-11-28: 16 files, 87 tests, 6.09 s). Fails →
     the e2e slow down or need the shared floci.
  4. Two worktrees under `alchemy dev` at once, each with a database: do both connect, with TLS
     and without? Fails → parallel worktrees are in question.
  5. `DBInstance` with engine version 18 runs `postgres:18-alpine`; how a host process and
     `make migrate` get its address. Fails → the database's declaration changes.
  6. A `StaticSite` for today's web in local prod: built, uploaded to S3 in floci, `/api/*` routed
     to the api's function through CloudFront. Fails → the web's local prod is partial.
  Also time: a cold and a warm `alchemy dev` beside `make up`, and an image rebuild after an edit.

- [A:ai] **Today's stand.** `make up` runs Pulumi (`deployment/`, about 330 lines): a MiniStack
  per worktree on port `4566 + 10N`, S3, SQS, an RDS instance as a Postgres container. `api` and
  `worker` run on the host under `bun --watch`; MiniStack's proxy mode POSTs each SQS batch to the
  worker's `/events` (`deployment/local/index.ts`, `apps/worker/worker.handler.ts`). The worker's
  function in `deployment/aws/worker.ts` is a stand-in with an empty `bootstrap`; no AWS stack
  exists. The e2e run starts its own Postgres and MiniStack containers and each test provisions
  its stage through the SDK (`kernel/data/__tests__/testing/e2e/e2e.test-setup.ts`,
  `apps/e2e/testing/stand.test-layer.ts:76`).

- [A:ai] **Alchemy v2.** `alchemy dev` runs the stack on floci, `alchemy deploy` on AWS, from one
  `alchemy.run.ts`; a beta ("Expect breaking changes"), peer `effect ^4.1.4`.
  - A zip Lambda is Node only: `runtime?: "nodejs22.x" | "nodejs24.x"` (`Lambda/Function.ts:420`),
    bundled with `platform: "node"` (`Lambda/FunctionBundle.ts:210`); it hot-swaps in dev, 100–500
    ms by the docs.
  - An image Lambda is supported, `image: { context, dockerfile }` (`Lambda/Function.ts:953`),
    with no watch in dev: "There is no ZIP module graph to watch or hot-swap"
    (`Lambda/FlociFunctionProvider.ts:144`). Its `command` and `entryPoint` are function settings,
    outside the image hash (`Lambda/FunctionImage.ts:89`), so one image serves two functions.
  - `Command.Dev` runs a host command during `alchemy dev`, restarts it when its props change, and
    does nothing on deploy (`alchemy: Command/Dev.ts:154`); its `env` takes stack outputs
    (`aws: Website/StaticSite.ts:280` feeds one so). `AlchemyContext.dev` tells dev from deploy.
  - `EventSourceMapping` is a resource (`Lambda/EventSourceMapping.ts`); `SQS.consumeQueueMessages`
    is the Effect-function form and returns `batchItemFailures`.
  - Websites: `StaticSite`, `SsrSite` and per-framework resources (`Nextjs`, `TanStackStart`, …);
    a framework's server function defaults to `nodejs24.x` (`Website/FrameworkSite.ts:142`).
  - One floci per machine: the port `4566` and the name `alchemy-floci` are fixed
    (`AuthProvider.ts:58`, `Local/Floci.ts:113`); worktrees are split by stage, which the
    worktrees guide derives from the folder name. Alchemy passes floci no settings
    (`Local/FlociServices.ts:60`); a floci already on the port is used as is.

- [A:ai] **floci.**
  - No forwarding of an invoke to a host URL: the executor is `docker` or `kubernetes` only
    (`LambdaRuntimeLauncherProducer.java:54`).
  - The SQS mapping polls each second with no receive wait (`SqsEventSourcePoller.java:89,201`),
    honours `batchItemFailures` (`:286`), and hides in-flight messages for the function's timeout
    plus about 30 s (`:194`); at most 4 containers per function (`application.yml:488`).
  - Lambda Web Adapter is supported by name, with tests (`RuntimeApiServer.java:35`,
    `ContainerLauncherTest.java:2392`); a Function URL streams (`RuntimeApiServer.java:413`).
    Containers stay warm for 300 s.
  - RDS: the requested engine version replaces the image's tag, so 18 gives `postgres:18-alpine`
    (`RdsService.java:9174`); every instance sits behind host port 5432, told apart by the TLS
    server name (`EmulatorConfig.java:1941`).
  - State is in memory: a Docker restart drops every stage's resources (alchemy issue 2724, open).
  - About 140 service folders, `cognito` and `cloudfront` among them; how faithful each is was
    not checked.

- [A:ai] **Bun on Lambda, and the paths set aside.**
  - Bun's own guide deploys a container image with Lambda Web Adapter; the worker's `/events` is
    already that adapter's request (`docs/knowledge/aws.md`, Queues). The deployed function must
    set `AWS_LWA_ERROR_STATUS_CODES=500`.
  - Node zip functions: the simplest Alchemy path with the fast swap, set aside by the owner's
    word (Bun at runtime). The api's module graph does import under Node v24.18 as is.
  - ECS on Fargate: Alchemy's Bun path (`oven/bun:1`, `ECS/Task.ts:355`), a relaunch of about 6 s
    per edit; set aside, as it leaves Lambda and never scales to zero.
  - A source bind mount into the Lambda container (`FLOCI_SERVICES_LAMBDA_DOCKER_FLAGS`), a
    `provided.al2023` cast with a Bun layer, the `bun-lambda` layer (stagnant): hacks, set aside.
  - Customer-managed runtimes (AWS, GA 2026-11-18, the launch post names Bun): a zip function on
    a runtime image. Alchemy's `main` has them with floci support (PRs 3664, 3668), unreleased,
    and documents that the image "must provide Node.js". The future clean path: see Later.
  - Lambda Web Functions: Node and Python only, HTTP only; not for the worker, not for Bun.
  - Cloudflare: Workers run no Bun, host no Postgres, and every entry point, the database
    client's life cycle, the queues, the files and the tests would be rewritten; set aside.
  - Cold starts (the `lambda-coldstarts` benchmark, run of 2026-11-27, arm64, 1024 MB, an empty
    handler): Node 24 115 ms, Bun on a customer-managed runtime 91 ms. No 2025–2026 measurement
    of a Bun image with the adapter was found.

- [D:ai] **The proposed design**, for the owner to accept, change or refuse after L1:

  ```
  alchemy.run.ts
  ├─ always:   the bucket and its lifecycle rule, the queues with their DLQs, Postgres 18
  ├─ dev:      Command.Dev for api, worker and web (bun --watch on the host);
  │            a forwarder function (Node, dev only) and a mapping per queue
  └─ else:     the api's function (image, Function URL), the worker's function (the same
               image, a mapping per queue), the web as a site
  ```

  ```
  dev         web ──/api──▶ api :API_PORT ──SendMessage──▶ SQS (floci)
              SQS ──batch──▶ forwarder ──POST /events──▶ worker :WORKER_PORT
  local prod  web ──/api──▶ Function URL ──▶ adapter ──HTTP──▶ api (Bun in a container)
              SQS ──batch──▶ adapter ──POST /events──▶ worker (Bun in a container)
  prod        as local prod, on AWS
  ```

  - The apps' entry points do not change: `BunRuntime`, `BunHttpServer` and `POST /events` stay.
  - It is written Alchemy's way wherever Bun allows, as the conventions below list: the layout,
    the declarations, generated names, outputs as the processes' environment. What Bun rules out
    is bindings alone.
  - Dev is told from the rest by `(yield* AlchemyContext).dev`; local prod differs from dev by
    one environment variable the stack reads.
  - The forwarder is the one piece with no counterpart in production: about 15 lines that do what
    MiniStack's proxy mode does today. Without it the worker cannot run on the host.
  - The e2e keep their own Postgres container and take a floci container in MiniStack's place;
    a test provisions its stage and a forwarder through the SDK.
  - The web is a `StaticSite` while it is a single-page app; the day it is a framework's server,
    its resource changes and its function runs on Node, the framework's own target.
  - The worktree rule changes from "its own containers" to "its own stage and host ports, one
    shared floci"; `RDS_BASE_PORT`, the per-tree emulator port and `ministackImage` go.

- [A:ai] **Alchemy's own conventions** (its docs as Markdown, `https://alchemy.run/<page>.md`,
  its `examples/` and `packages/aws/AGENTS.md`; read 2026-11-28, `main` compared with beta.87):
  1. `alchemy.run.ts` at the workspace root is the composition root alone: "name the Stack, merge
     Providers, pick a State Store, wire units into outputs" (`project-structure/file-layout`).
     A monorepo starts with a single Stack at the root (`project-structure/monorepo`).
  2. "one file per Resource or Layer, group Resources that travel together"; a declaration is
     inert until a Stack yields it and is memoized by its logical id, so several units may yield
     one. Modules and ids are PascalCase in every example (`src/Db.ts`, `"JobsTable"`).
  3. A resource a producer and a consumer share has its own module (`aws/messaging/sqs`).
  4. A per-stage setting sits beside its resource, read from `Stack`, not in the root file.
  5. No physical names: Alchemy generates `<stack>-<id>-<stage>-<suffix>` and tags each resource
     with its stack, stage and id (`alchemy: PhysicalName.ts:64`, `Tags.ts:39`). An explicit name
     appears in the examples only to adopt a resource that exists.
  6. Runtime code reaches a resource through a binding, which writes the IAM statement and the
     environment variable. **Bindings exist only in a function Alchemy bundles** (a zip function
     on Node). For an image function or a host process the stated way is the resources' outputs
     as `env`, and IAM by `fn.bind(sid, { policyStatements })` (issue 3288, open; the repo's own
     `EventSourceMapping.test.ts:376`).
     Alchemy's own guide for its code composes with layers the same way
     (`packages/aws/AGENTS.md`: `Layer.mergeAll`, and `Layer.provideMerge` for a composite over
     its foundation).
  7. A consumer sets `functionUrl: false`: left out, a function gets a public URL.
  8. An image function: `image: { context, dockerfile, command }`, sources literal,
     `architecture` required, no secrets in build args. A raw `EventSourceMapping` defaults to
     `ReportBatchItemFailures` for SQS and grants no IAM; the queue's visibility timeout is at
     least the function's timeout.
  9. `Config` read in the stack's construction is bound as a secret; a function's `env` is stored
     in state as a fingerprint. In beta.87 a secret `env` value is plain text in the function's
     configuration; `main` moves it to SSM (PR 3741).
  10. State: `AWS.state()` (DynamoDB) for shared and CI stages; `Alchemy.localState()` writes
      `.alchemy/`, gitignored, not for CI. The stage: `--stage`, then `ALCHEMY_STAGE`, then
      `dev_$USER` or `live_$USER`; a worktree derives it from its folder; no fixed `dev.port`.
  11. Removal is `destroy` by default; `RemovalPolicy.retain(stage === "prod")` beside the
      resource. A renamed id replaces the resource unless piped through `Alchemy.renamedFrom`.
  12. The web: `Website.StaticSite` with `build` and `dev` commands, and `Website.Router` with
      `"/api/*": { url }`; the router is emulated in dev.
  13. Tests: `Test.make({ providers, state, dev: true })`, `beforeAll(deploy(Stack))`, a stage per
      run, `test_$USER` by default.
  14. A plain container: `Docker.Container` of `@alchemy.run/docker`. One declared in dev alone
      is in no example; nor is any guidance for or against branching on the mode, which
      Alchemy's own `StaticSite` does.
  Stale between beta.87 and `main` (235 commits): `ALCHEMY_DEV` is false under `Test.make` in
  beta.87 (fixed by PR 3328), so the stack reads `AlchemyContext.dev`; five breaking changes
  wait in `main` (secret env to SSM, state encryption, masked `state read`, deletion protection
  refused, distilled pinned to `main`), so the version is pinned exactly and these notes are
  read again at each bump.

- [D:ai] **The layout and the moves, Alchemy's way with Bun kept:**

  ```
  deployment/
    alchemy.run.ts          the Stack: providers, state, the mode's layer, the outputs
    Dockerfile              one image; the api's and the worker's command differ
    Queues.ts               each queue with its dead-letter queue, as declarations
    Storage.ts              the bucket and its lifecycle rule
    Database.ts             the Postgres instance
    Telemetry.ts            the telemetry backend's container, dev only
    Web.ts                  the site and its router
    Compute.ts              the service: the api and the worker on the host or as functions
    dev-relay.ts            the forwarder's handler
  ```

  All of it sits in `deployment/`, the owner's question of 2026-11-28 ("Could it be all in
  deployment?"): the root keeps no stack file. The CLI takes the stack's file as
  `--config <file>`, `alchemy.run.ts` at the working directory being only its default
  (`alchemy: Cli/commands/flags.ts:166`; the tutorial runs `alchemy deploy --config
  stacks/github.ts`), so the `make` targets run `bun alchemy <command> --config
  deployment/alchemy.run.ts` from the root. This leaves convention 1 below in one point, the
  file's place. The image's build context stays the repository root, since the image copies the
  workspaces, with `dockerfile: 'deployment/Dockerfile'`; every path in the stack is anchored
  with `import.meta.dirname`, as relative ones resolve from the working directory. Where
  `.alchemy/` lands when the file is not at the root is the probe's check 13.

  | Today | Its fate |
  |---|---|
  | `kernel/aws/resources/resources.ts`, the inventory as data | becomes the declarations of `deployment/`: one source |
  | `ResourceName.build`, `app-template-<stage>-<name>` | deleted: Alchemy names the resources |
  | the clients of `kernel/aws` that build a name from `STAGE` | stay, and read the bucket's name and each queue's URL from `Config` |
  | the worker picking a queue's handler by a built name (`apps/worker/worker.handler.ts`) | picks it by the queue's ARN from `Config` |
  | `deployment/aws/*.ts`, `deployment/local/*`, `deployment/shared/tags.ts` | deleted: Pulumi, MiniStack, and tags Alchemy writes itself |
  | `STAGE`, `.env.pulumi`, `RDS_BASE_PORT`, the emulator's port per tree | `ALCHEMY_STAGE`; the values come from the stack as each process's `env` |
  | `make up` then `make dev` | `make dev` runs `bun alchemy dev`; `make dev-prod`, `make deploy` beside it |

  The stack is an Effect program, so its logic is structured by Effect's core, by this repo's
  own Effect rules (`.claude/rules/effect-style.md`, `effect-services.md`, `composition.md`);
  the owner's word, 2026-11-28: "you could use full power of effect core, also adjust plan so
  you could struct logic in alchyme with it". Each use below removes a way to get the stack
  wrong; one that removes none is not written. The Effect names were read in `repos/effect`
  (`Context.Service`, `Layer.unwrap`, `Layer.mergeAll`, `Config.schema`, `Duration.sum`,
  `Effect.fn`, `Effect.forEach`); the Alchemy names in the sources above; none of it run.

  | Effect's means | What it holds in the stack | The mistake it removes |
  |---|---|---|
  | a `Context.Service` with two layers | `Compute`: where the api and the worker run. `layerHost` is the two `Command.Dev` and the forwarder, `layerLambda` the two image functions | a branch on the mode through the stack's body; a third placement is a third layer |
  | a table `as const satisfies Record<Mode, …>` | the mode (`dev`, `localProd`, `deployed`) to its `Compute` layer | a mode added and forgotten: it fails typecheck until its row exists |
  | `Config`, read in the stack's construction | the stack's settings and the secrets the processes take (the model's key), from `kernel/config` | a setting read from `process.env` by hand; a secret in state as plain text |
  | one `Schema.Struct` of the processes' environment, in `kernel/config` | the apps decode it with `Config.schema`; the stack's `env` record `satisfies` its keys | a key the stack writes and no process reads, or the reverse |
  | `Duration`, one value derived from another | the queues' visibility timeout as `Duration.sum` of the worker's timeout and a margin | AWS refusing a mapping, or a message delivered twice, when one number changes alone |
  | `Effect.fn('<Unit>.<step>')` | each declaration unit (`Queues.withDeadLetters`, `Compute.worker`) | a failed deploy that names no unit; each unit is a span in the deploy's trace |
  | `Effect.forEach` over the queues' table | a queue, its dead-letter queue, its mapping and its IAM statement, per row | a queue declared without its mapping or its permission |
  | errors in one tail | the stack's body reads as if nothing fails; a failure is logged once at its end | a `try` around a step in mid-flow |
  | `Layer.mergeAll` for the providers, `Layer.unwrap` for the layer the mode picks | the root's wiring | providers built twice; the mode read in more than one place |

  ```ts
  // deployment/alchemy.run.ts — the body has no branch; the mode picks a layer once, at the root
  Effect.gen(function* () {
    const compute = yield* Compute

    const bucket = yield* Files
    const queues = yield* Queues
    const database = yield* Database

    const env = buildProcessEnv({ bucket, queues, database })   // satisfies ProcessEnv's keys
    const api = yield* compute.api(env)
    yield* compute.worker(env, queues)

    const web = yield* Web(api.url)
    return { url: web.url }
  }).pipe(Effect.provide(ComputeByMode))
  ```

  ```ts
  // deployment/Compute.ts
  export class Compute extends Context.Service<Compute, {
    readonly api: (env: ProcessEnv) => Effect.Effect<{ readonly url: Output<string> }, …>
    readonly worker: (env: ProcessEnv, queues: Queues) => Effect.Effect<void, …>
  }>()('@app-template/deployment/Compute') {
    static readonly layerHost = Layer.effect(this, …)     // Command.Dev ×2, the forwarder
    static readonly layerLambda = Layer.effect(this, …)   // image functions, their mappings
  }
  const layers = {
    dev: Compute.layerHost,
    localProd: Compute.layerLambda,
    deployed: Compute.layerLambda,
  } as const satisfies Record<Mode, Layer.Layer<Compute, …>>
  ```

  `Compute` is a service by this repo's own rule: one "a second implementation stands in for".
  The declarations (`Files`, `Queues`, `Database`, `Web`) stay plain exported effects, Alchemy's
  form: each has one implementation, so a service in front of them would be a pass-through.

  What this crosses, by the owner's word in Knowledge: the inventory's naming rule (the apps no
  longer build a name; `kernel/aws`, the worker's routing and the e2e provisioner change);
  `deployment/CLAUDE.md`'s "names follow the kernel's naming rule"; the file-naming rule, for
  PascalCase modules in `deployment/`. The stack imports no app file, so the import guard holds.

- [Q:ai] The most idiomatic Alchemy is bindings, and bindings need a zip function on Node: the
  api and the worker as classes in their own files, no branch on the mode, no forwarder, no
  hand-written IAM, the fast swap. The owner's `[D]` (Bun at runtime) rules it out; said here so
  the cost of that `[D]` is on the page: the forwarder, `fn.bind` statements, a slow local prod.

- [R] Checks the conventions add to the probe: 7. a host process under `Command.Dev` reaches
  floci (are the endpoint and the credentials in its `env`, or ours to pass?); 8. an
  `EventSourceMapping` and `fn.bind` on an image function; 9. the dev `Router` proxying `/api/*`
  to a host process's URL; 10. `Test.make({ dev: true })` per test file beside today's
  provisioning through the SDK, in seconds; 11. the Drizzle migrations through
  `DBInstance.migrations` with `migrationsTransport: "direct"`, or `make migrate` kept; 12. a
  `Context.Service` of ours provided to the stack's program by `Effect.provide`, its layer
  yielding Alchemy resources: does the Stack accept it, and do the resources keep their ids?

- [N:ai] Risks the probe sizes: the e2e's speed, as a forwarder needs a Lambda container per
  test where MiniStack needed none (the largest); the forwarder's delay in dev; two databases on
  port 5432; a local prod rebuild per edit (alchemy issue 3565 reports 32–38 s for an ECS
  service); CloudFront in floci.

- [N:ai] Not verified at all: that `HttpRouter`-level code needs no change under the adapter's
  readiness check; how a floci started outside Alchemy behaves for Alchemy's own providers;
  whether floci enforces IAM (assumed not).

Sources: `https://alchemy.run/aws/local-development/`,
`https://alchemy.run/environments/worktrees`, `https://alchemy.run/testing/test-harness`,
`https://github.com/alchemy-run/floci`, `https://github.com/alchemy-run/alchemy` (issues 2724,
3288, 3427, 3565; PRs 3664, 3668), `https://bun.com/guides/deployment/aws-lambda`,
`https://docs.aws.amazon.com/lambda/latest/dg/runtimes-customer-managed.html`,
`https://coldstarts.github.nimmervoll.work/`.

### Output

## Knowledge

- [D] Bun is the runtime of the deployed api and worker; a faster reload on Node does not
  outweigh it (the owner, 2026-11-28).
- [D] One infrastructure description serves three modes: dev (host processes with watch), local
  prod (Lambda functions, no watch) and prod (the same on AWS).
- [D] With Alchemy the only emulator is floci; MiniStack stays in no part, the e2e included.
- [D] No hacks: nothing that works around Alchemy or floci (a bind mount, a cast runtime, an
  unreleased branch).
- [D] The hosting is AWS, on Lambda.
- [D] The e2e keep their two kinds (the owner's "ok", 2026-11-28). The in-process ones (the
  adapters' and the services') stand on a floci container of their own per run, started and
  stopped by testcontainers on a free port, their resources made through the SDK and a database
  copied from the template per test, as today with MiniStack. The journeys of `apps/e2e` run
  through the deployed stack: `beforeAll(deploy(Stack))` of Alchemy's test harness with
  `dev: true`, on the shared floci, in the stage the harness derives from the worktree
  (`repos/alchemy/packages/alchemy-test/src/`, the worktree's stage), driven over the api's
  Function URL. Open: the scripted assistant in a deployed worker, the data the journeys share,
  and both speeds, unmeasured.
- [D] The configuration is written the way Alchemy recommends. Where that meets one of this
  repo's rules, the rule may be broken for now ("If needed breake the rules for now", the owner,
  2026-11-28, on the two cases below); each break is named in the step that makes it, with the
  rule or guard it crosses, and the rule is rewritten at this lab's close.
  - The stack importing an app's file (a function's class beside the app's code) crosses
    `deployment`'s row of [architecture.md › Dependency rules](../../knowledge/architecture.md#dependency-rules),
    which `biome-imports.grit` refuses.
  - Physical names Alchemy generates cross the inventory's naming rule
    ([aws.md › The inventory](../../knowledge/aws.md#the-inventory)): the apps, the worker's
    routing by queue name and the e2e provisioner all build a name from the stage.

## Later

- The Lambda path's own limits never met in dev (a 6 MB body, the frozen environment, IAM): what
  local prod must exercise before a deploy — L4 — open
- Telemetry flushed before Lambda freezes; the adapter leaves 2 s at shutdown
  (`docs/knowledge/roadmap.md`, entry 9, "Inherits from `telemetry-minimal`") — L4 — open
- A Function URL behind CloudFront with origin access control wants `x-amz-content-sha256` on a
  POST (`docs/knowledge/roadmap.md`, entry 9, the security audit) — `aws-deployment` — open
- **Reminder: AWS opened a cleaner way to run Bun on Lambda; check it again before L4 and at this
  lab's close.** Customer-managed runtimes (GA 2026-11-18) run a zip Event Function on a runtime
  image from ECR, and the launch post names Bun; such a function would keep the Function URL and
  the SQS mappings, hot-swap in `alchemy dev` like any zip function, and need no image rebuild
  per edit, so local prod and dev could become one mode. What to check, each by its source:
  1. `npm view alchemy dist-tags`: a release past `2.0.0-beta.87` that ships PRs 3664 and 3668
     (`AWS.Lambda.Runtime`, `RuntimeAlias`, and their run on floci).
  2. Whether its `runtime` contract still reads "its image must provide Node.js and the Node.js
     runtime interface client" (`Lambda/Function.ts` on `main`), or admits a Bun image.
  3. A Bun runtime image to stand on: `@beesolve/lambda-bun-runtime` v4 (one star on 2026-11-28),
     or an official one from Bun or AWS, should either appear.
  4. Lambda Web Functions taking a custom runtime or an image (aws-lambda-roadmap issue 103);
     today they refuse both.
  5. Bun's `oven-sh/bun` issue 47213 (the same random values in clones of one snapshot) before
     any use of SnapStart.
  Until 1 and 2 hold, this path is a hack by the owner's rule and stays out — after a release
  past `2.0.0-beta.87` — open
- `make debug-<app>` in local prod: an inspector inside a floci Lambda container was not looked
  at — L4 — open
- The image is arm64 on this machine; a CI runner on x86 builds it under emulation — L4 — open
- The roadmap's "Alchemy in place of Pulumi" and entry 9's facts name MiniStack and Pulumi as the
  local mode: rewrite at this lab's close — L5 — open
