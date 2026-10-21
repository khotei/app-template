# AWS

How the app reaches S3 and SQS, locally and on AWS, and how the resources it needs are described,
created and tested. The code: `packages/aws` (the inventory, the naming rule, the provisioner),
`deployment/local/` (MiniStack and the local provisioner), `packages/testing/ministack.ts`.

## The local stand-in

[MiniStack](https://hub.docker.com/r/ministackorg/ministack) emulates S3 and SQS on
`http://localhost:4566`. Its image is pinned by digest in `deployment/local/docker-compose.yml` and
in `packages/testing/ministack.ts`; bump both together.

| Target | Does |
|---|---|
| `make up` | `docker compose up -d --wait`, then `deployment/local/provision.ts`: creates the inventory under `STAGE` and prints each resource as `created` or `unchanged`. A second run prints `unchanged` for everything. |
| `make down` | stops the container. State survives: MiniStack writes it on shutdown and reads it on start, under `.data/ministack/`. |
| `make reset` | `make down`, then removes `.data/` whole: MiniStack's state, the key-value store and the queue file. The way back after an inventory change that SQS refuses (below). |

`AWS_REGION`, `AWS_ENDPOINT_URL` and `STAGE` are read through `AwsConfig` in
`@app-template/config`; today the provisioner is its only reader, and the apps still run on the
file store and the SQLite queue without `make up`. Credentials never pass through it: the SDK's default provider chain reads
`AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` from `.env` locally (any value satisfies MiniStack)
and the role on AWS, whose session token rotates. With an endpoint set, S3 uses path-style
addressing; without one, the SDK's own endpoints.

## The inventory

`packages/aws/resources.ts` lists every bucket and queue as plain data, keyed by an identifier and
carrying its logical `name`. Physical names are `buildResourceName(stage, name)`:
`app-template-<stage>-<name>`, so `local`, every test file and every AWS stage hold their own set.

| Resource | Carries | Provisioned as |
|---|---|---|
| bucket `attachments` | `lifecycle.unboundExpirationDays`, `lifecycle.abortIncompleteUploadDays` | the bucket and two lifecycle rules: objects carrying `unboundTag` (`unbound=true`) expire; incomplete multipart uploads are aborted. |
| queue `assistant-message`, `chat-title` | `maxReceiveCount` | `<name>-dlq` first, then `<name>` with a `RedrivePolicy` to it. A queue definition in `infrastructure` reads its `name` and `maxAttempts` from here; `infrastructure/shared/resources.test.ts` fails when they disagree. |

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

## Tests on Docker

Tests at the AWS boundary (`packages/aws/*.test.ts`) start one MiniStack container per test file
through the `MiniStack` layer in `@app-template/testing` (`testcontainers`), provision a fresh
`test-<random>` stage from `buildStage()`, and stop the container with the suite. So `make test` needs a running Docker
daemon from now on; the container starts in about two seconds, and the suites pass
`{ timeout: '60 seconds' }` to `layer(…)` for the pull on a cold machine. Unique stages isolate
parallel files without resets; nothing cleans a stage up, since the container goes with it.

MiniStack differs from AWS in what it never does: lifecycle rules never run, the 5 MiB minimum
part size is not enforced. What depends on those is checked on real AWS in the deploy ticket.
