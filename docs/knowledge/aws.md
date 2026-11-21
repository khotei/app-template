# AWS

How the app reaches S3 and SQS, locally and on AWS, and how the resources it needs are described,
created and tested. The code: the kernel's `aws` part (the inventory, the naming rule, the apps'
S3 and SQS clients and, in its e2e support, the provisioner), `packages/aws` (the inventory's
types and the dead-letter naming rule) and `deployment/` (the Pulumi program of the local stand
and the resource code it runs); the e2e support, [tooling.md › Tests](tooling.md#tests).

## The local stand-in

[MiniStack](https://hub.docker.com/r/ministackorg/ministack) emulates S3, SQS and RDS on the TCP
port of `AWS_ENDPOINT_URL`, one per tree ([tooling.md › Worktrees](tooling.md#worktrees)).
`deployment/local/` is a Pulumi project of its
own (`runtime: bun`): `@pulumi/docker`'s `Container` with the image by digest, the environment,
the bind mount of `.data/ministack` and the health check with `wait: true`, so `pulumi up` returns
only once MiniStack responds. The program reads `AWS_REGION`, `AWS_ENDPOINT_URL` and `STAGE` from
`.env` (how `make up` passes it:
[tooling.md › Environment](tooling.md#environment)): MiniStack's default region is `AWS_REGION`,
its 4566 is published on the endpoint's TCP port, and the container is named
`app-template-<STAGE>-ministack`, so the stacks of several trees share no port, container or state.
A new name or image replaces the container, the old one deleted first because it holds the TCP port.

Through an `aws.Provider` that waits for the healthy container, the same program creates inside
MiniStack the inventory (below) and the database: an `aws.rds.Instance` of Postgres, named
`app-template-<STAGE>-database`. The resource code lives in `deployment/aws/` as functions of a
provider, so the AWS stacks call it without an endpoint. MiniStack runs the instance as a real
Postgres container on the host's Docker (its socket is mounted), on the host port `RDS_BASE_PORT`
(`MINISTACK_RDS_PUBLIC_ENDPOINT=1` reports `localhost`), with its data in a named volume
(`RDS_PERSIST=1`). The program exports `DATABASE_URL`, built from the instance's endpoint, and
`make up` writes it to `.env.pulumi` (how it loads:
[tooling.md › Environment](tooling.md#environment)). The
local credentials are fixed in `deployment/local/settings.ts`, the one file that reads the
configuration. MiniStack names the instance's container and volume after the identifier, so each
worktree has its own `STAGE` and `RDS_BASE_PORT` ([tooling.md › Worktrees](tooling.md#worktrees)).

`make up` sets `VCR_MODE=REPLAY_ONLY`, a switch of the provider's own test harness that skips
its fixed waits around queues, lifecycle rules and instances: measured from `make reset`, a cold
`make up` takes 8 s with it and 87 s without. A provider release without it makes `up` slow,
never wrong.

The Pulumi state is a file backend under `.data/pulumi` with an empty passphrase: its one secret is
the local database's password, a constant in `settings.ts`. Each command names the tree's backend
in `PULUMI_BACKEND_URL`, so no login is stored. `PULUMI_HOME` is the main tree's `.pulumi/`, so a
clone touches nothing outside the repo, `make reset` keeps the provider plugins, and a worktree
reuses them: its first `make up` takes 9 s, not the 44 s of a download (858 MB for AWS). The
image digest is pinned once, as `ministackImage` in `@app-template/kernel/config`, which the
local program and the tests' container both read.

| Target | Does |
|---|---|
| `make stack` | creates the tree's file backend under `.data/pulumi` and selects the `local` stack or creates it; it never runs `pulumi login`. Idempotent; `up` runs it first. |
| `make up` | refreshes the containers alone, MiniStack and the telemetry backend ([observability.md](observability.md)), so a stopped one starts again; a full refresh, or `up --refresh`, while MiniStack is down would drop the bucket from the state. Then `pulumi up`, `.env.pulumi` and `make migrate`, which waits for a database MiniStack is still respawning ([database.md › Migrations](database.md#migrations)). A second `make up` changes nothing. |
| `make down` | `docker stop` of MiniStack, which saves its state under `.data/ministack/` and stops the instance's container, and of the telemetry backend; the stack keeps every resource. |
| `make reset` | `docker rm -f` of MiniStack, of the telemetry backend, of the instance's container and of the tree's Postgres MCP containers ([tooling.md › Claude Code's Postgres MCP](tooling.md#claude-codes-postgres-mcp)), `docker volume rm` of its volume, then removes `.data/` (MiniStack's state and the Pulumi stack) and `.env.pulumi`. No `pulumi destroy` runs: every resource lives in what these commands remove, and the stack's state goes with `.data/`. `.pulumi/` (the provider plugins) stays. |

An `up` that fails midway keeps what it created in the stack's state; the next `make up` goes on
from there, and `make reset` starts afresh.

`AWS_REGION`, `AWS_ENDPOINT_URL` and `STAGE` are read together in
`@app-template/kernel/config`; the Pulumi program and the apps' S3 and SQS clients read them,
so the apps need `make up`. Credentials never pass through it: the SDK's default provider chain
reads `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` from `.env` locally (any value satisfies
MiniStack) and the role on AWS, whose session token rotates. With an endpoint set, S3 uses
path-style addressing; without one, the SDK's own endpoints.

### When the stand fails

| When | Then |
|---|---|
| Docker is not running | `make up` fails in the Docker provider; start Docker and run it again |
| the Pulumi CLI is missing | `make up`, `down`, `reset` and `stack` fail at `pulumi`; install it (<https://www.pulumi.com/docs/install/>). `make check` does not need it |
| an older `.env` lacks `AWS_*`, `STAGE` or `RDS_BASE_PORT` | `make up` fails with a `ConfigError` naming the variable; `make setup` leaves an existing `.env` alone, so copy the block from `.env.example` |
| the first `make up` takes longer | it downloads the Docker and AWS provider plugins into `.pulumi/` once; worktrees reuse them |
| the endpoint's TCP port is taken | the container fails to start; free the TCP port (a leftover MiniStack container, or another emulator) |
| `make up` failed midway | run it again; it goes on from what it created |
| you want a clean slate | `make reset` also wipes the database, not only MiniStack |

## The inventory

`kernel/aws/resources/resources.ts` lists every bucket and queue, and the worker's function, as
plain data, keyed by an identifier and carrying its logical `name`. Physical names are
`buildResourceName(stage, name)`: `app-template-<stage>-<name>`, so `local`, every e2e test and
every AWS stage hold their own set.

| Resource | Carries | Provisioned as |
|---|---|---|
| a bucket | its `lifecycle` days | the bucket and its lifecycle rule, which aborts incomplete multipart uploads. |
| a queue | `maxReceiveCount`, `visibilityTimeoutSeconds` | its dead-letter queue first, named by `buildDeadLetterName` from the physical name (`app-template-<stage>-<name>-dlq`), then the queue with a `RedrivePolicy` to it. A queue definition in a module's `infrastructure/` reads its `name` from here, so the two cannot disagree. |

`make up` creates the inventory through Pulumi, with the resource code of `deployment/aws/`; the
e2e tests create each test's stage with `provision(resources, stage)` from the e2e support of
`kernel/aws`, in milliseconds and without the Pulumi CLI: the provisioner names each resource by
`buildResourceName`. It creates the buckets and the queues, without the lifecycle rules
(MiniStack never runs them), and is idempotent: `CreateBucket` on a bucket the account holds and
`CreateQueue` on an identical queue both succeed. `CreateQueue` compares a repeated
`RedrivePolicy` as a string, so its JSON is built with a fixed key order. A queue whose
`maxReceiveCount` changed in the inventory fails with `QueueNameExists`, because SQS never updates
on create; Pulumi updates the queue in place. A queue whose `name` changed is a new queue, as SQS
renames none: the next `make up` on a stack that holds the old one creates the new queue, its
dead-letter queue and its mapping, and deletes the old three with the messages they held; an e2e
stage is new on every e2e run.

### Adding a resource

1. Add the entry to `resources.ts`; a queue's dead-letter queue is derived, not listed.
2. For a queue, add its definition in `application/<module>/infrastructure/<model>.queue.ts`,
   reading `name` from the entry, and its row in the worker's route
   (`apps/worker/worker.handler.ts`), which typecheck asks for. A bucket's entry alone reaches no
   code: `S3BucketFromConfig` binds the one `S3Bucket` to the `attachments` entry, so a second
   bucket needs a client of its own
   ([architecture.md › Add a store's client](architecture.md#add-a-stores-client)).
   Code that names a missing entry fails typecheck.
3. `make up` creates it locally.

## Files

`FileRepository`, in the data layer, stores a file's bytes in the `attachments` bucket under
`attachments/<id>` (`buildFileKey`): it holds only the keys, which its entity file declares, and
the headers; the upload itself is `S3Bucket` in `packages/s3`, taken from the context.
`S3BucketFromConfig`, among the kernel's AWS clients, binds it to the stage's bucket. No app
provides either today: no module stores bytes since attachments were removed
([decisions.md › Attachments removed](decisions.md#attachments-removed)), and the bucket keeps
the name and the key prefix they had. The store joins no transaction, so a flow that writes a row
and its bytes keeps the bytes before the row that binds them and deletes them once the rows are
gone.

- **Upload.** The file streams in and is never buffered whole: up to 5 MiB it is one `PutObject`,
  above that a multipart upload in 5 MiB parts. The latest part is held back until the stream
  ends, so a failing or interrupted upload is aborted and leaves neither an object nor a stray
  upload; the bucket's rule that aborts incomplete uploads is the backstop for a crashed process.
- **The object says how it is served.** Its media type and an `inline` disposition with the file
  name are written at upload, so the URL a read signs needs no overrides.
- **The signed URL.** A read returns a `GetObject` URL presigned for 300 seconds.
- **The signed host.** The host is part of the signature, so the browser must reach the host the
  process signs with. With an endpoint set, S3 uses path-style addressing and the URL is
  `http://localhost:<port>/<bucket>/attachments/<id>?X-Amz-…`, which the browser reaches because
  MiniStack is published on the host. A process running inside Docker would sign with a host the
  browser cannot reach; that needs a presign-only client on the public endpoint.

## Queues

`QueueSender` and `consumeQueue` (`packages/queue`) are the two sides of SQS: the first encodes a
message by its definition's schema ([database.md › The sends](database.md#the-sends)), the second
decodes each body by it. A definition's queue is `buildResourceName(STAGE, definition.name)`.

- **SQS invokes the worker.** Each queue has an event source mapping to the worker's function,
  with `ReportBatchItemFailures`. Locally the function runs in MiniStack's proxy mode: each batch
  goes to the worker's `POST /events` on the host (`MINISTACK_LAMBDA_PROXY_URL`), the request
  Lambda Web Adapter makes on AWS. The worker picks a batch's consumer by the queue name in its
  records' `eventSourceARN`. A queue of the inventory with no consumer fails typecheck; a batch of
  a queue outside the inventory responds with `500`, a deployment bug.
- **The work's record keeps a job's work to one.** A queue's use case reads the record of its work
  (the Run and the chat's title, through `ReplyChatService` and `TitleChatService`, which report one
  settled, started or gone as a typed error) and skips work already settled; it ends its own work on
  any outcome but success, an interrupt included
  ([database.md › Stuck Runs](database.md#stuck-runs)). A body that does not decode never will, so
  it is logged and acknowledged, unrun.
- **Delivery is at-least-once:** the reply's job fails a Run it finds started, as the worker that
  started it died, so a copy delivered while the first is still handled fails a live Run, and of two
  delivered at the same instant the one that loses its start's write fails the Run the other works
  on, a rare case accepted.
- **Only a defect returns to the queue.** A handler has no error channel: its use case settles
  its work's failure itself. A record whose handler dies (a process that dies included) is
  returned in `batchItemFailures`, or not returned at all; SQS delivers it again once the queue's
  visibility timeout, the worker function's 600 s, has passed, and after `maxReceiveCount`, 3,
  redrives it to `<queue>-dlq`. A delivery after the work settled skips it. AWS refuses a mapping
  on a queue that hides a message less than its function's timeout.
- **Nothing consumes a dead-letter queue.** A Run's worker writes `failed` on any outcome but
  success; one that no worker settles stays active
  ([database.md › Stuck Runs](database.md#stuck-runs)).
- **AWS differs in one HTTP status.** MiniStack counts any non-2xx response as a failed invoke; Lambda
  Web Adapter only the codes in `AWS_LWA_ERROR_STATUS_CODES`, none by default, so the deployed
  function must list `500`.

`consumeQueue` calls no SQS, so its suite needs none.

## Tests on Docker

The e2e run's one MiniStack, and where its harnesses live: [tooling.md › Tests](tooling.md#tests).
`AwsTest` gives each test a stage of its own (`e2e` and eight hex digits),
provisions the inventory's bucket and queues under it and provides a `ConfigProvider` naming the
region, the endpoint and that stage, so the kernel's clients build their names as in production; it
publishes the SDK clients too, which the kernel's `*FromConfig` layers keep closed, and the
stage's `S3Bucket`. The e2e
through the api add the worker's function and its mappings with `provisionWorker`, its proxy on
the stand's worker, and the `s3` suite creates one bucket, named as a stage is, for its
`S3Bucket`. Nothing cleans a stage up: the container goes with the e2e run. The Pulumi
project is for `make up` alone.

MiniStack differs from AWS in what it never does: lifecycle rules never run, and the 5 MiB minimum
part size is not enforced. What depends on those is checked on real AWS in the deploy ticket.
