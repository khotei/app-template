# AWS

How the app reaches S3 and SQS, locally and on AWS, and how the resources it needs are described,
created and tested. The code: `packages/aws` (the inventory, the naming rule, the provisioner),
`deployment/local/` (the Pulumi project that runs MiniStack, and the local provisioner),
`packages/testing/ministack.ts`.

## The local stand-in

[MiniStack](https://hub.docker.com/r/ministackorg/ministack) emulates S3 and SQS on the port of
`AWS_ENDPOINT_URL`: `http://localhost:4566` in the main tree, another port in each worktree
([tooling.md › Worktrees](tooling.md#worktrees)). `deployment/local/` is a Pulumi project of its
own (`runtime: bun`): `@pulumi/docker`'s `Container` with the image by digest, the environment,
the bind mount of `.data/ministack` and the health check with `wait: true`, so `pulumi up` returns
only once MiniStack answers. The program reads `AwsConfig` from `.env` (how `make up` passes it:
[tooling.md › Environment](tooling.md#environment)): MiniStack's default region is `AWS_REGION`,
its 4566 is published on the endpoint's port, and the container is named
`app-template-ministack-<port>`, so the stacks of several trees share no port, container or state.
A new name or image replaces the container, the old one deleted first because it holds the port.

The Pulumi state is a file backend under `.data/pulumi` with an empty passphrase (nothing secret
is stored), and `PULUMI_HOME` is the tree's `.pulumi/`, so a clone touches nothing outside the
repo, `make reset` keeps the provider plugin, and each worktree downloads its own on its first
`make up`. The image digest is pinned in `deployment/local/ministack.ts` and
`packages/testing/ministack.ts`, which name each other.

| Target | Does |
|---|---|
| `make stack` | logs the Pulumi CLI in to the file backend and selects the `local` stack or creates it. Idempotent; `up` and `down` run it first. |
| `make up` | `pulumi up --yes --skip-preview`, then `deployment/local/provision.ts`: creates the inventory under `STAGE` and prints each resource as `created` or `unchanged`. A second run changes nothing in Pulumi and prints `unchanged` for every resource. |
| `make down` | `pulumi destroy`: removes the container. State survives: MiniStack writes it on shutdown and reads it on start, under `.data/ministack/`. |
| `make reset` | `make down`, then removes `.data/` whole: MiniStack's state, the Pulumi stack and the key-value store; `.pulumi/` (the provider plugin) stays. The way back after an inventory change that SQS refuses (below). |

An `up` that fails on the health check leaves the container in the stack's state; `make down`
destroys it, and the next `make up` starts afresh.

`AWS_REGION`, `AWS_ENDPOINT_URL` and `STAGE` are read through `AwsConfig` in
`@app-template/config`; the provisioner, `ministack.ts` and the apps' S3 and SQS clients read it,
so the apps need `make up`. Credentials never pass through it: the SDK's default provider chain
reads `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` from `.env` locally (any value satisfies
MiniStack) and the role on AWS, whose session token rotates. With an endpoint set, S3 uses
path-style addressing; without one, the SDK's own endpoints.

## The inventory

`packages/aws/resources.ts` lists every bucket and queue as plain data, keyed by an identifier and
carrying its logical `name`. Physical names are `buildResourceName(stage, name)`:
`app-template-<stage>-<name>`, so `local`, every test file and every AWS stage hold their own set.

| Resource | Carries | Provisioned as |
|---|---|---|
| bucket `attachments` | `lifecycle.unboundExpirationDays`, `lifecycle.abortIncompleteUploadDays` | the bucket and two lifecycle rules: objects carrying `unboundTag` (`unbound=true`) expire; incomplete multipart uploads are aborted. |
| queue `assistant-message`, `chat-title` | `maxReceiveCount` | its dead-letter queue first, named by `buildDeadLetterName` from the physical name (`app-template-<stage>-<name>-dlq`), then the queue with a `RedrivePolicy` to it. A queue definition in `infrastructure` reads its `name` and `maxAttempts` from here; `infrastructure/shared/resources.test.ts` fails when they disagree. |

`provision(inventory, stage)` is idempotent: an existing bucket gets its lifecycle rules re-applied,
and `CreateQueue` on an identical queue succeeds. Two AWS behaviours shape it: a repeated
`CreateBucket` answers by region (`us-east-1` succeeds, elsewhere `BucketAlreadyOwnedByYou`), so
existence is read with `HeadBucket` first; and `CreateQueue` compares a repeated `RedrivePolicy` as
a string, so its JSON is built with a fixed key order. A queue whose `maxReceiveCount` changed in
the inventory fails with `QueueNameExists`, because SQS never updates on create: locally, `make
reset`; on AWS, Pulumi (the deploy ticket).

### Adding a resource

1. Add the entry to `resources.ts`; a queue's dead-letter queue is derived, not listed.
2. For a queue, add its definition in `infrastructure/<entity>/<entity>.queue.ts`, reading `name`
   and `maxAttempts` from the entry (`make test` fails until both sides agree).
3. `make up` creates it locally; `provision.test.ts` reads it back.

## Attachments

An attachment's record stays in the key-value store; its bytes live in the `attachments` bucket
under `attachments/<id>` (`AttachmentStoreS3` in `infrastructure/attachment/attachment.storage.ts`).
The api and the worker run on `AttachmentKvS3`, so `.data/store` holds no attachment bytes; the
api's test harness keeps `AttachmentKv`, whose download is a `data:` URL.

- **Upload.** The file streams in and is never buffered whole: up to 5 MiB it is one `PutObject`,
  above that a multipart upload in 5 MiB parts. A failing or interrupted upload is aborted, so it
  leaves neither an object nor a stray upload; the bucket's rule that aborts incomplete uploads is
  the backstop for a crashed process.
- **The object says how it is served.** Its media type and an `inline` disposition with the file
  name are written at upload, so the download URL is signed without overrides.
- **The unbound tag.** A new object carries `unbound=true`, which the bucket's expiration rule
  ([The inventory](#the-inventory)) acts on; binding the attachment removes it.
- **Download.** The api answers `302` to a `GetObject` URL presigned for 300 seconds.
- **The signed host.** The host is part of the signature, so the browser must reach the host the
  api signs with. With an endpoint set, S3 uses path-style addressing and the URL is
  `http://localhost:<port>/<bucket>/attachments/<id>?X-Amz-…`, which the browser reaches because
  MiniStack is published on the host. An api running inside Docker would sign with a host the
  browser cannot reach; that needs a presign-only client on the public endpoint.

## Queues

`QueueClient` (`packages/queue`) sends and consumes jobs over `QueueTransport`, four SQS calls
(`send`, `receive`, `extend`, `delete`). `QueueClientSqs` in `infrastructure/shared` wires it for
the apps from `QueueConfig` and `AwsConfig`: a definition's queue is
`buildResourceName(STAGE, definition.name)`.

- **Delivery is at-least-once** (`QueueDefinition.jobId` in `packages/queue/queue.ts`): the jobs
  skip a settled reply and a titled chat.
- **An attempt is a receive.** A worker long-polls for one message at a time, and the
  message stays hidden for `QUEUE_LOCK_EXPIRATION`; a heartbeat extends that every
  `QUEUE_LOCK_REFRESH_INTERVAL` while the handler runs. The attempt number is SQS's
  `ApproximateReceiveCount`, and the last attempt is the definition's `maxAttempts`, which is the
  inventory's `maxReceiveCount`.
- **Every outcome is a visibility.** Success deletes the message. A failure with attempts left
  hides it for the retry delay that `retrySchedule` gives that attempt, rounded up to whole
  seconds. The last failure, a body that does not decode and an interrupt (a worker stopping, a
  handler interrupting itself) make it visible at once, so an interrupt spends its attempt.
- **Redrive is the only way to the dead-letter queue.** The receive after the
  `maxReceiveCount`-th moves the message to `<queue>-dlq` instead of returning it; the client never
  sends there itself. A worker that dies mid-attempt leaves its message hidden until the
  visibility runs out; it then comes back as the next attempt, or goes to the dead-letter queue
  (`replyAttempts` in `infrastructure/chat/chat.queue.ts` says what that means for a reply).
- **A stopped worker's long poll can outlive it.** Interrupting a receive aborts its HTTP request,
  but MiniStack keeps the poll open and hides the next message it finds for its visibility
  timeout; that message returns after `QUEUE_LOCK_EXPIRATION` with an attempt spent.

Every test that touches a queue runs on MiniStack in real time: the queue's own suite, the job
suites, and the api and chat harnesses, each provisioning the inventory under a fresh stage. The
job suites keep the handlers' own sleeps on the `TestClock` and wait for SQS in real time
(`runUntilDrained` in `application/testing/queue.harness.ts`).

## Tests on Docker

Tests at the AWS boundary (`packages/aws/*.test.ts`, `packages/queue/queue.transport.test.ts`,
`infrastructure/attachment/attachment.storage.test.ts`) start one MiniStack container per test
file through the `MiniStack` layer in `@app-template/testing` (`testcontainers`), reach it through
`AwsClientsMiniStack` from the same package (S3 and SQS clients on that container), provision a
fresh `test-<random>` stage from `buildStage()`, and stop the container with the suite. So
`make test` needs a running Docker daemon from now on, and nothing else: the Pulumi project is for
`make up` alone. The container starts in about two seconds, and the suites pass
`{ timeout: '60 seconds' }` to `layer(…)` for the pull on a cold machine. Unique stages isolate
parallel files without resets; nothing cleans a stage up, since the container goes with it.

MiniStack differs from AWS in what it never does: lifecycle rules never run, the 5 MiB minimum
part size is not enforced. What depends on those is checked on real AWS in the deploy ticket.
