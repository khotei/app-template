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
| `make reset` | `make down`, then removes `.data/` whole: MiniStack's state, the Pulumi stack, the key-value store and the queue file; `.pulumi/` (the provider plugin) stays. The way back after an inventory change that SQS refuses (below). |

An `up` that fails on the health check leaves the container in the stack's state; `make down`
destroys it, and the next `make up` starts afresh.

`AWS_REGION`, `AWS_ENDPOINT_URL` and `STAGE` are read through `AwsConfig` in
`@app-template/config`; today the provisioner and `ministack.ts` are its only readers, and the
apps still run on the file store and the SQLite queue without `make up`. Credentials never pass
through it: the SDK's default provider chain reads `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`
from `.env` locally (any value satisfies MiniStack) and the role on AWS, whose session token
rotates. With an endpoint set, S3 uses path-style addressing; without one, the SDK's own
endpoints.

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

The bytes of an attachment live in the `attachments` bucket under `attachments/<id>`, written and
served by `AttachmentStoreS3` (`infrastructure/attachment/attachment.storage.s3.ts`); its record
stays in the key-value store. `AttachmentKvS3` bundles the two and builds the S3 client from
`AwsConfig`, so the api and the worker run on it, and `.data/store` holds no attachment bytes. The
api's test harness keeps `AttachmentKv`, whose `AttachmentStoreKv` keeps the bytes beside the
record and answers `url` with a `data:` URL.

- **Upload.** The request's file arrives as a stream and is never buffered whole. A file of up to
  5 MiB is one `PutObject`; a larger one is a multipart upload in 5 MiB parts (two at most under
  the 10 MiB cap). A part is sent only once a byte beyond it has arrived, so the last part is
  whatever the stream ends with. A stream that fails, or an insert that is interrupted, aborts the
  multipart upload, so neither an object nor a stray upload is left; the bucket's second lifecycle
  rule is only the backstop for a crashed process.
- **Headers on the object.** `ContentType` is the attachment's media type and
  `ContentDisposition` is `inline; filename*=UTF-8''<percent-encoded name>` (RFC 8187), so any file
  name survives and the browser shows the file rather than saving it. The download URL carries no
  overrides: the object already says how it is served.
- **The unbound tag.** Every new object carries `unbound=true`, the tag the expiration rule
  matches; `keep` removes it when the attachment is bound. `PutObject` sets it with `Tagging`; a
  multipart upload sets it with `PutObjectTagging` after the complete, because MiniStack ignores
  `Tagging` on `CreateMultipartUpload`.
- **Download.** `url` heads the object first, since presigning never looks and the port answers
  none for an id without bytes; then it presigns a `GetObject` for 300 seconds, signed at the
  Effect clock's time (so a test can sign in the past). The api answers `302` to it.
- **The signed host.** The host is part of the signature, so the browser must reach the host the
  api signs with. With an endpoint set, S3 uses path-style addressing and the URL is
  `http://localhost:<port>/<bucket>/attachments/<id>?X-Amz-…`, which the browser reaches because
  MiniStack is published on the host. An api running inside Docker would sign with a host the
  browser cannot reach; that needs a presign-only client on the public endpoint.
- **Failures.** An S3 failure dies, as every store failure does: only the stream's own error is
  typed. A missing key is a value: `select` and `url` answer none, `keep` and `delete` succeed.

## Tests on Docker

Tests at the AWS boundary (`packages/aws/*.test.ts`, `packages/queue/queue.transport.test.ts`)
start one MiniStack container per test file through the `MiniStack` layer in
`@app-template/testing` (`testcontainers`), reach it through `AwsClientsMiniStack` from the same
package (S3 and SQS clients on that container), provision a fresh `test-<random>` stage from
`buildStage()`, and stop the container with the suite. So `make test` needs a running Docker
daemon from now on, and nothing else: the Pulumi project is for `make up` alone. The container
starts in about two seconds, and the suites pass `{ timeout: '60 seconds' }` to `layer(…)` for the
pull on a cold machine. Unique stages isolate parallel files without resets; nothing cleans a stage
up, since the container goes with it.

MiniStack differs from AWS in what it never does: lifecycle rules never run, the 5 MiB minimum
part size is not enforced. What depends on those is checked on real AWS in the deploy ticket.
