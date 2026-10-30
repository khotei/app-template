# AWS

How the app reaches S3 and SQS, locally and on AWS, and how the resources it needs are described,
created and tested. The code: `packages/aws` (the inventory, the naming rule, the provisioner),
`deployment/local/` (the Pulumi program of the local stand), `deployment/aws/` (its resources),
`infrastructure/testing/e2e.test-setup.ts` (the MiniStack the e2e run starts),
`packages/testing/aws.test-layer.ts` (its clients) and `infrastructure/testing/aws.test-layer.ts`
(a stage per test).

## The local stand-in

[MiniStack](https://hub.docker.com/r/ministackorg/ministack) emulates S3, SQS and RDS on the port of
`AWS_ENDPOINT_URL`: `http://localhost:4566` in the main tree, another port in each worktree
([tooling.md › Worktrees](tooling.md#worktrees)). `deployment/local/` is a Pulumi project of its
own (`runtime: bun`): `@pulumi/docker`'s `Container` with the image by digest, the environment,
the bind mount of `.data/ministack` and the health check with `wait: true`, so `pulumi up` returns
only once MiniStack answers. The program reads `AwsConfig` from `.env` (how `make up` passes it:
[tooling.md › Environment](tooling.md#environment)): MiniStack's default region is `AWS_REGION`,
its 4566 is published on the endpoint's port, and the container is named
`app-template-ministack-<port>`, so the stacks of several trees share no port, container or state.
A new name or image replaces the container, the old one deleted first because it holds the port.

Through an `aws.Provider` that waits for the healthy container, the same program creates inside
MiniStack the inventory (below) and the database: an `aws.rds.Instance`, Postgres 18, named
`app-template-<STAGE>-database`. The resource code lives in `deployment/aws/` as functions of a
provider, so the AWS stacks call it without an endpoint. MiniStack runs the instance as a real
Postgres container on the host's Docker (its socket is mounted), on the host port `RDS_BASE_PORT`
(`MINISTACK_RDS_PUBLIC_ENDPOINT=1` reports `localhost`), with its data in a named volume
(`RDS_PERSIST=1`). The program exports `DATABASE_URL`, built from the instance's endpoint, and
`make up` writes it to `.env.pulumi` (how it loads:
[tooling.md › Environment](tooling.md#environment)). The
local credentials are fixed in `deployment/local/settings.ts`, the one module that reads the
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
image digest is pinned once, as `ministackImage` in `@app-template/config`, which
`deployment/local/ministack.ts` and the tests' container both read.

| Target | Does |
|---|---|
| `make stack` | logs the Pulumi CLI in to the file backend and selects the `local` stack or creates it. Idempotent; `up` runs it first. |
| `make up` | refreshes the MiniStack container alone, once it is in the state, so a stopped one starts again; a full refresh, or `up --refresh`, while MiniStack is down would drop the bucket from the state. Then `pulumi up`, `.env.pulumi` and `make migrate`, which waits for a database MiniStack is still respawning ([database.md › Migrations](database.md#migrations)). A second run changes nothing. |
| `make down` | `docker stop` of MiniStack, which saves its state under `.data/ministack/` and stops the instance's container; the stack keeps every resource. |
| `make reset` | `docker rm -f` of MiniStack and of the instance's container, `docker volume rm` of its volume, then removes `.data/` (MiniStack's state and the Pulumi stack) and `.env.pulumi`. No `pulumi destroy` runs: every resource lives in what these commands remove, and the stack's state goes with `.data/`. `.pulumi/` (the provider plugins) stays. |

An `up` that fails midway keeps what it created in the stack's state; the next `make up` goes on
from there, and `make reset` starts afresh.

`AWS_REGION`, `AWS_ENDPOINT_URL` and `STAGE` are read through `AwsConfig` in
`@app-template/config`; the Pulumi program and the apps' S3 and SQS clients read it,
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
| port 4566 is taken | the container fails to start; free the port (a leftover `app-template-ministack-4566`, or another emulator) |
| `make up` failed midway | run it again; it goes on from what it created |
| you want a clean slate | `make reset` also wipes the database, not only MiniStack |

## The inventory

`packages/aws/resources.ts` lists every bucket and queue as plain data, keyed by an identifier and
carrying its logical `name`. Physical names are `buildResourceName(stage, name)`:
`app-template-<stage>-<name>`, so `local`, every e2e test and every AWS stage hold their own set.

| Resource | Carries | Provisioned as |
|---|---|---|
| bucket `attachments` | `lifecycle.unboundExpirationDays`, `lifecycle.abortIncompleteUploadDays` | the bucket and two lifecycle rules: objects carrying `unboundTag` (`unbound=true`) expire; incomplete multipart uploads are aborted. |
| queue `assistant-message`, `chat-title` | `maxReceiveCount` | its dead-letter queue first, named by `buildDeadLetterName` from the physical name (`app-template-<stage>-<name>-dlq`), then the queue with a `RedrivePolicy` to it. A queue definition in `infrastructure` reads its `name` and `maxAttempts` from here, so the two cannot disagree. |

`make up` creates the inventory through Pulumi (`deployment/aws/storage.ts`, `queue.ts`); the
e2e tests create each test's stage with `provision(resources, stage)` from `packages/aws`, in
milliseconds and without the Pulumi CLI. It creates the buckets and the queues, without the
lifecycle rules (MiniStack never runs them), and is idempotent: `CreateBucket` on a bucket the
account holds and `CreateQueue` on an identical queue both succeed. `CreateQueue` compares a
repeated `RedrivePolicy` as a string, so its JSON is built with a fixed key order. A queue whose
`maxReceiveCount` changed in the inventory fails with `QueueNameExists`, because SQS never
updates on create; Pulumi updates the queue in place.

### Adding a resource

1. Add the entry to `resources.ts`; a queue's dead-letter queue is derived, not listed.
2. For a queue, add its definition in `infrastructure/<entity>/<entity>.queue.ts`, reading `name`
   and `maxAttempts` from the entry; for a bucket, the adapter reads it from `resources.buckets`.
   Code that names a missing entry fails typecheck.
3. `make up` creates it locally.

## Attachments

An attachment's record lives in Postgres; its bytes live in the `attachments` bucket under
`attachments/<id>`. `AttachmentBucketS3` (`infrastructure/attachment/attachment.bucket.ts`)
holds only the keys, the headers, the tag and the mapping to the domain port; the upload itself
is `S3Bucket` in `packages/s3`, bound to the stage's bucket by `S3BucketFromConfig` in the same
file. The api and the worker run on `AttachmentPgS3`.

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
  ([Tests on Docker](#tests-on-docker)), so `attachment.bucket.e2e.ts` asserts the tag on a
  small upload only. Binding the attachment removes the tag before the bind is written, so a
  crash between leaves an orphaned object, never a bound attachment without bytes.
- **Expiry.** An attachment still unbound 24 hours after its upload (`unboundLifetime` in
  `domain/attachment`) reads as not found everywhere; no read deletes it, since a delete on read
  would race a send binding it. Its object goes by the bucket's rule, which acts after
  `unboundExpirationDays` (S3 rounds up to the next midnight UTC);
  `infrastructure/tests/shared/resources.test.ts` keeps those days no shorter than `unboundLifetime`, so
  nothing still bindable loses its bytes. Its row stays, since no sweep removes expired rows.
  Locally the object stays as well, since MiniStack never runs the rule
  ([Tests on Docker](#tests-on-docker)).
- **Download.** The api answers `302` to a `GetObject` URL presigned for 300 seconds.
- **The signed host.** The host is part of the signature, so the browser must reach the host the
  api signs with. With an endpoint set, S3 uses path-style addressing and the URL is
  `http://localhost:<port>/<bucket>/attachments/<id>?X-Amz-…`, which the browser reaches because
  MiniStack is published on the host. An api running inside Docker would sign with a host the
  browser cannot reach; that needs a presign-only client on the public endpoint.

## Queues

`QueueConsumer` (`packages/queue`) consumes jobs over `QueueTransport`, four SQS calls
(`send`, `receive`, `extend`, `delete`); jobs reach SQS only through the outbox relay
([database.md › The outbox](database.md#the-outbox)). `QueueConsumerSqs` in `infrastructure/shared` wires it for
the worker from `QueueConfig` and `AwsConfig`: a definition's queue is
`buildResourceName(STAGE, definition.name)`.

- **Delivery is at-least-once** (`QueueDefinition.jobId` in `packages/queue/queue.ts`): the jobs
  skip a settled reply and a titled chat.
- **An attempt is a receive.** A worker long-polls for one message at a time, and the
  message stays hidden for `QUEUE_LOCK_EXPIRATION`; a heartbeat extends that every
  `QUEUE_LOCK_REFRESH_INTERVAL` while the handler runs. The attempt number is SQS's
  `ApproximateReceiveCount`, and the last attempt is the definition's `maxAttempts`, which is the
  inventory's `maxReceiveCount`.
- **Every outcome is a visibility**, as the `QueueConsumer.consume` doc in
  `packages/queue/queue.ts` lists them; SQS rounds a retry delay up to whole seconds, and an
  interrupt (a worker stopping, a handler interrupting itself) spends its attempt.
- **Redrive is the only way to the dead-letter queue.** The receive after the
  `maxReceiveCount`-th moves the message to `<queue>-dlq` instead of returning it; the client never
  sends there itself. A worker that dies mid-attempt leaves its message hidden until the
  visibility runs out; it then comes back as the next attempt, or goes to the dead-letter queue.
  A reply's last attempt writes `failed` on any outcome but success, a stopping worker included
  (`apps/worker/chat/assistant-message.handler.ts`). That write never happens after a killed
  process, a store failing the write, or a stopped worker's leftover long poll spending the last
  attempt: the reply stays active with its job in the dead-letter queue, until the handler's
  `handleDeadLettered` fails it (below).
- **The worker consumes both dead-letter queues.** `assistantMessageDeadLetterQueue` and
  `chatTitleDeadLetterQueue` (`infrastructure/chat/chat.queue.ts`) define `<queue>-dlq` with
  `maxAttempts` at `Number.MAX_SAFE_INTEGER` and a retry delay that doubles up to 5 minutes:
  nothing redrives a dead-letter queue, so a failing handler must never reach a last attempt.
  The receive count carries over through the redrive (checked on MiniStack), so the first
  receive there is attempt `maxReceiveCount + 1`. The reply's consumer logs the stuck reply and
  writes it `failed` with `ReplyFailed`, a cause naming the queue and the attempts, and the
  chat's `updatedAt`, under the status guard the job uses, so a reply settled meanwhile or a
  deleted chat is only logged. The title's consumer only logs, since an untitled chat is
  harmless.
- **A stopped worker's long poll can outlive it.** Interrupting a receive aborts its HTTP request,
  but MiniStack keeps the poll open and hides the next message it finds for its visibility
  timeout; that message returns after `QUEUE_LOCK_EXPIRATION` with an attempt spent.
- **The worker relays the outbox.** The api writes its jobs to the `outbox` table
  ([database.md › The outbox](database.md#the-outbox)), and `OutboxRelay` in the worker sends
  the rows to `buildResourceName(STAGE, queue)` over the same `QueueTransport`. A row the relay sent and could not
  delete is sent again, which the at-least-once handlers absorb.

The queue's own suite checks those rules on MiniStack in real time. A worker handler's suite
calls its `handle` with plain `AttemptInfo` values over the memory layers, so the last attempt
and the dead letter need no queue.

## Tests on Docker

The e2e `globalSetup` (`infrastructure/testing/e2e.test-setup.ts`) starts one MiniStack beside
the run's Postgres (`testcontainers`, about two seconds for both) and hands its endpoint to the
tests through `inject('awsEndpoint')`; `SqsClientTest` and `S3ClientTest` in
`@app-template/testing` are clients on it. `AwsTest` (`infrastructure/testing/aws.test-layer.ts`)
gives each test a stage of its own (`e2e` and eight hex digits), provisions the inventory's
bucket and queues under it and provides `AwsConfig` over the endpoint and that stage, so an
adapter builds its names as in production; it publishes the clients too, as the `*FromConfig`
layers do. The queue's own suite provisions its own queues under one such stage for its `layer`
block, with `provisionQueues`, and the `s3` suite creates one bucket, named as a stage is, for
its `S3Bucket`. Nothing cleans a stage up: the container goes with the run. On `AwsTest` run
`AttachmentBucketS3`'s suite, the relay's (beside `DbTest`), the use cases' transactions
(`ChatPgTest`, whose bucket is the stage's) and the journey. The unit suites test our code, not
S3 or SQS: they provide `AttachmentBucketTest` and `recordQueue()`
([tooling.md › Tests](tooling.md#tests)). So `make test-e2e` needs a running Docker daemon and
nothing else, not the local stand or `.env`: the Pulumi project is for `make up` alone.

MiniStack differs from AWS in what it never does: lifecycle rules never run, the 5 MiB minimum
part size is not enforced, and the `Tagging` sent with `CreateMultipartUpload` is dropped. What
depends on those is checked on real AWS in the deploy ticket.
