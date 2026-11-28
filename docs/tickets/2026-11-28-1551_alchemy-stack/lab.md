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

## Map

| Step | Goal, and how to see it | Pass | Kind | Status |
|---|---|---|---|---|
| L1 | The probe answers go or no-go on six checks, in a throwaway worktree · visible: a table of what ran and its timings | minimal | learn | todo |
| L2 | One `alchemy.run.ts` declares the bucket, the queues and the database on floci, and `make dev` runs api, worker and web on the host over them · visible: `make dev`, a chat message gets its reply | minimal | build | todo |
| L3 | The e2e run stands on floci, no MiniStack · visible: `make test-e2e` green, its duration beside today's | minimal | build | todo |
| L4 | Local prod: api and worker as Lambda functions from one Bun image on floci, the web as a site · visible: `make dev-prod`, the same chat through the Function URL | minimal | build | todo |
| L5 | Pulumi and MiniStack are gone; `aws.md`, `tooling.md` and the worktree rules say what holds · visible: `make check` green | minimal | build | todo |
| L6 | Later: the items of the open list the owner picks | hard | build | todo |

The steps past L1 are a proposal: L1's Output may redraw them. Deploying to a real AWS account
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

Nothing below was run. Each fact was read on 2026-11-28 from the named source: the repo, the
tarballs `alchemy@2.0.0-beta.87` and `@alchemy.run/aws@2.0.0-beta.87` (paths under their `src/`),
and floci at the tag `2.4.0-alchemy.3`, the image that Alchemy version pins
(`aws: Local/Floci.ts:47`).

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

  - The apps' code does not change: `BunRuntime`, `BunHttpServer` and `POST /events` stay.
  - Names come from the inventory, `resources` and `ResourceName.build` of `kernel/aws`.
  - Local prod differs from dev by one environment variable the stack reads.
  - The forwarder is the one piece with no counterpart in production: about 15 lines that do what
    MiniStack's proxy mode does today. Without it the worker cannot run on the host.
  - The e2e keep their own Postgres container and take a floci container in MiniStack's place;
    a test provisions its stage and a forwarder through the SDK.
  - The web is a `StaticSite` while it is a single-page app; the day it is a framework's server,
    its resource changes and its function runs on Node, the framework's own target.
  - The worktree rule changes from "its own containers" to "its own stage and host ports, one
    shared floci"; `RDS_BASE_PORT`, the per-tree emulator port and `ministackImage` go.

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
