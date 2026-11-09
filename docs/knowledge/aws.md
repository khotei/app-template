# AWS

How the app reaches S3 and SQS, locally and on AWS, and how the resources it needs are described,
created and tested. The code: the kernel's `aws` part (the inventory, the naming rule, the apps'
S3 and SQS clients), `packages/aws` (the generic provisioner) and `deployment/` (the Pulumi
program of the local stand and the resource code it runs); the e2e support,
[tooling.md › Tests](tooling.md#tests).

## The local stand-in

[MiniStack](https://hub.docker.com/r/ministackorg/ministack) emulates S3, SQS and RDS on the port of
`AWS_ENDPOINT_URL`, one per tree ([tooling.md › Worktrees](tooling.md#worktrees)).
`deployment/local/` is a Pulumi project of its
own (`runtime: bun`): `@pulumi/docker`'s `Container` with the image by digest, the environment,
the bind mount of `.data/ministack` and the health check with `wait: true`, so `pulumi up` returns
only once MiniStack answers. The program reads `AwsConfig` from `.env` (how `make up` passes it:
[tooling.md › Environment](tooling.md#environment)): MiniStack's default region is `AWS_REGION`,
its 4566 is published on the endpoint's port, and the container is named
`app-template-ministack-<port>`, so the stacks of several trees share no port, container or state.
A new name or image replaces the container, the old one deleted first because it holds the port.

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
| `make up` | refreshes the MiniStack container alone, once it is in the state, so a stopped one starts again; a full refresh, or `up --refresh`, while MiniStack is down would drop the bucket from the state. Then `pulumi up`, `.env.pulumi` and `make migrate`, which waits for a database MiniStack is still respawning ([database.md › Migrations](database.md#migrations)). A second run changes nothing. |
| `make down` | `docker stop` of MiniStack, which saves its state under `.data/ministack/` and stops the instance's container; the stack keeps every resource. |
| `make reset` | `docker rm -f` of MiniStack, of the instance's container and of the tree's Postgres MCP containers ([tooling.md › Claude Code's Postgres MCP](tooling.md#claude-codes-postgres-mcp)), `docker volume rm` of its volume, then removes `.data/` (MiniStack's state and the Pulumi stack) and `.env.pulumi`. No `pulumi destroy` runs: every resource lives in what these commands remove, and the stack's state goes with `.data/`. `.pulumi/` (the provider plugins) stays. |

An `up` that fails midway keeps what it created in the stack's state; the next `make up` goes on
from there, and `make reset` starts afresh.

`AWS_REGION`, `AWS_ENDPOINT_URL` and `STAGE` are read through `AwsConfig` in
`@app-template/kernel/config`; the Pulumi program and the apps' S3 and SQS clients read it,
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
| the endpoint's port is taken | the container fails to start; free the port (a leftover `app-template-ministack-<port>`, or another emulator) |
| `make up` failed midway | run it again; it goes on from what it created |
| you want a clean slate | `make reset` also wipes the database, not only MiniStack |

## The inventory

`kernel/aws/resources/resources.ts` lists every bucket and queue as plain data, keyed by an
identifier and carrying its logical `name`. Physical names are `buildResourceName(stage, name)`:
`app-template-<stage>-<name>`, so `local`, every e2e test and every AWS stage hold their own set.

| Resource | Carries | Provisioned as |
|---|---|---|
| a bucket | its `lifecycle` days | the bucket and its lifecycle rules; the attachments' bucket expires the objects carrying the data layer's `unboundTag` (`unbound=true`) and aborts incomplete multipart uploads. |
| a queue | `maxReceiveCount` | its dead-letter queue first, named by `buildDeadLetterName` from the physical name (`app-template-<stage>-<name>-dlq`), then the queue with a `RedrivePolicy` to it. A queue definition in a module's `services/` reads its `name` from here, so the two cannot disagree. |

`make up` creates the inventory through Pulumi, with the resource code of `deployment/aws/`; the
e2e tests create each test's stage with
`provision(resources, (name) => buildResourceName(stage, name))` from `packages/aws`, in
milliseconds and without the Pulumi CLI: the provisioner knows no naming rule, its caller passes
one. It creates the buckets and the queues, without the lifecycle rules (MiniStack never runs
them), and is idempotent: `CreateBucket` on a bucket the account holds and `CreateQueue` on an
identical queue both succeed. `CreateQueue` compares a repeated `RedrivePolicy` as a string, so
its JSON is built with a fixed key order. A queue whose `maxReceiveCount` changed in the
inventory fails with `QueueNameExists`, because SQS never updates on create; Pulumi updates the
queue in place.

### Adding a resource

1. Add the entry to `resources.ts`; a queue's dead-letter queue is derived, not listed.
2. For a queue, add its definition in `application/<module>/services/<model>.queue.ts`, reading
   `name` from the entry; for a bucket, `S3BucketFromConfig` reads it from
   `resources.buckets`.
   Code that names a missing entry fails typecheck.
3. `make up` creates it locally.

## Attachments

An attachment's record lives in Postgres; its bytes live in the `attachments` bucket under
`attachments/<id>`. `FileRepository`, in the data layer, holds only the keys, the headers and the
tag, which its entity file declares beside the key; the upload itself is `S3Bucket` in
`packages/s3`, taken from the context. `S3BucketFromConfig`, among the kernel's AWS clients,
binds it to the stage's bucket, and the api and the worker provide it beside
`FileRepository.layer`. The store joins no transaction, so a service keeps the bytes
before the row that binds them and deletes them once the rows are gone.

- **Upload.** The file streams in and is never buffered whole: up to 5 MiB it is one `PutObject`,
  above that a multipart upload in 5 MiB parts, so a file within `maxFileSize` takes two at most.
  The latest part is held back until the stream ends, so a failing or interrupted upload is
  aborted and leaves neither an object nor a stray upload; the bucket's rule that aborts
  incomplete uploads is the backstop for a crashed process.
- **The object says how it is served.** Its media type and an `inline` disposition with the file
  name are written at upload, so the download URL is signed without overrides.
- **The unbound tag.** A new object carries `unbound=true`, sent with the `PutObject` or
  `CreateMultipartUpload` that writes it, and the bucket's expiration rule
  ([The inventory](#the-inventory)) acts on the tag; locally a file over 5 MiB stays untagged
  ([Tests on Docker](#tests-on-docker)), so the repository's e2e asserts the tag on a small
  upload only. Binding the attachment removes the tag before the bind is written, so a
  crash between leaves an orphaned object, never a bound attachment without bytes.
- **Expiry.** An attachment still unbound 24 hours after its upload (the attachment model's
  `unboundLifetime`) reads as not found everywhere; no read deletes it, since a delete on read
  would race a send binding it. Its object goes by the bucket's rule, which acts after
  `unboundExpirationDays` (S3 rounds up to the next midnight UTC); a unit test of the module's
  services keeps those days no shorter than `unboundLifetime`, so nothing still bindable loses
  its bytes. Its row stays, since no sweep
  removes expired rows. Locally the object stays as well, since MiniStack never runs the rule
  ([Tests on Docker](#tests-on-docker)).
- **Download.** The api answers `302` to a `GetObject` URL presigned for 300 seconds.
- **The signed host.** The host is part of the signature, so the browser must reach the host the
  api signs with. With an endpoint set, S3 uses path-style addressing and the URL is
  `http://localhost:<port>/<bucket>/attachments/<id>?X-Amz-…`, which the browser reaches because
  MiniStack is published on the host. An api running inside Docker would sign with a host the
  browser cannot reach; that needs a presign-only client on the public endpoint.

## Queues

`QueueSender` and `QueueConsumer` (`packages/queue`) are the two sides of SQS; `JobSender` in
`kernel/job` writes the job's row in `jobs` before its send
([database.md › The outbox](database.md#the-outbox)), and `QueueConsumer` decodes each body by
its definition's schema. A definition's queue is `buildResourceName(STAGE, definition.name)`.

- **SQS invokes the worker.** Each queue has an event source mapping to the worker's function,
  with `ReportBatchItemFailures`. Locally the function runs in MiniStack's proxy mode: each batch
  goes to the worker's `POST /events` on the host (`MINISTACK_LAMBDA_PROXY_URL`), the request
  Lambda Web Adapter makes on AWS. The worker picks a batch's consumer by the queue name in its
  records' `eventSourceARN`; a queue with no consumer answers `500`, a deployment bug.
- **The work's record runs a job once.** A queue's use case reads the record of its work (the
  assistant message, the chat's title) and skips work already settled; it ends its own work on
  any outcome but success, an interrupt included. A body that does not decode never will, so it
  is logged and acknowledged, unrun.
- **Delivery is at-least-once:** the reply's use case fails a reply it finds started, as the run
  that started it died, so a copy delivered while the first still runs fails a live reply, a
  rare case accepted.
- **A failed record returns to the queue.** A record whose handler fails or dies (a process that
  dies included) is answered in `batchItemFailures`, or not answered at all; SQS delivers it again
  once the queue's visibility timeout, the worker function's 600 s, has passed, and after
  `maxReceiveCount`, 3, redrives it to `<queue>-dlq`. A delivery after the work settled skips it.
  AWS refuses a mapping on a queue that hides a message less than its function's timeout.
- **Nothing consumes a dead-letter queue.** A reply's run writes `failed` on any outcome but
  success; one that no run settles stays active
  ([database.md › Stuck replies](database.md#stuck-replies)).
- **AWS differs in one status.** MiniStack counts any non-2xx answer as a failed invoke; Lambda
  Web Adapter only the codes in `AWS_LWA_ERROR_STATUS_CODES`, none by default, so the deployed
  function must list `500`.

`QueueConsumer` calls no SQS, so its suite needs none.

## Tests on Docker

The e2e run's one MiniStack, and where its harnesses live: [tooling.md › Tests](tooling.md#tests).
`AwsTest` gives each test a stage of its own (`e2e` and eight hex digits),
provisions the inventory's bucket and queues under it and provides `AwsConfig` over the endpoint
and that stage, so the kernel's clients build their names as in production; it
publishes the clients too, as the `*FromConfig` layers do, and the stage's `S3Bucket`. The e2e
through the api add the worker's function and its mappings with `provisionWorker`, its proxy on
the stand's worker, and the `s3` suite creates one bucket, named as a stage is, for its
`S3Bucket`. Nothing cleans a stage up: the container goes with the run. The Pulumi
project is for `make up` alone.

MiniStack differs from AWS in what it never does: lifecycle rules never run, the 5 MiB minimum
part size is not enforced, and the `Tagging` sent with `CreateMultipartUpload` is dropped. What
depends on those is checked on real AWS in the deploy ticket.
