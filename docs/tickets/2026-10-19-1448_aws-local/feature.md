# AWS local

> Ticket: `2026-10-19-1448_aws-local` · Source: [roadmap › 5](../../knowledge/roadmap.md#5-aws-local),
> grilling on 2026-10-19
> Related: [architecture.md](./architecture.md) · [plan.md](./plan.md)

## Goal

Attachment bytes move to S3 and jobs move to SQS, with MiniStack as the local AWS, so that `make
dev` runs against the same services production will use and `aws-deployment` (9) only has to
deploy what already works. One plain-data resource inventory describes every bucket and queue; the
local provisioner reads it now and the Pulumi program reads it later. Chat and message metadata
stay in `KeyValueStore` until `postgres-drizzle` (4).

## Context

- **Starting point.** `chat-core` (3) merged: `AttachmentStore { insert, select, delete }` over
  `KeyValueStore` (`AttachmentStoreKv`), `QueueClient { send, consume }` over `PersistedQueue`
  with a memory and a SQLite store (`QueueClientSqlite`), two queue definitions
  (`assistant-message`: `jobId = messageId`, `maxAttempts = 4`; `chat-title`: `jobId = chatId`,
  `maxAttempts = 5`; both `Schedule.exponential('1 second')`), `GET
  /attachments/:attachmentId/download` returning the bytes (`chat-core` R22), and the deletion of
  a chat's attachments with the chat (R9). `deployment/` is a typed stub: `docker-compose.yml`
  declares no services, `deployment/shared/naming.ts` builds `app-template-<stage>-<resource>`.
- **Both handlers are already idempotent.** A redelivered `assistant-message` job is skipped as
  `alreadySettled`, a redelivered `chat-title` job as `alreadyTitled`, so at-least-once delivery
  changes no result.
- **Decided in grilling (2026-10-19).**
  - AWS work is two tickets sharing one inventory: this one and `aws-deployment` (9), which
    depends on 4 and 5 and not on 7 or 8. This ticket depends on 3 only.
  - MiniStack, not LocalStack (licence; table below). It emulates the services only; the api and
    worker keep `bun --hot` and `--watch`. Running Lambda artefacts in MiniStack belongs to 9.
  - No outbox: the api sends a job right after its write, as today. The enqueue-after-insert risk
    stays with `postgres-drizzle` (4), whose relay will publish to the SQS layer.
  - `@effect-aws/client-s3` and `@effect-aws/client-sqs`, not the bare AWS SDK.
  - Standard queues, at-least-once, one queue and one dead-letter queue per queue definition.
  - Uploads still go through the api, streamed to S3; downloads become a redirect to a presigned
    URL.
  - Unbound attachments are collected by age here, as `chat-core` deferred ("arrives with S3").
  - MiniStack becomes required for `make dev`; the SQLite queue store and the attachment bytes in
    the file store are removed. Tests keep the in-memory layers, and the AWS adapters are tested
    against MiniStack in `make test` and CI.
  - Bucket and queue names come from the inventory and the stage, never from `.env`.
- **Facts verified on 2026-10-19.**

  | Fact | Value |
  |---|---|
  | LocalStack | OSS repository archived 2026-03-23; the single image needs `LOCALSTACK_AUTH_TOKEN`; the free Hobby plan forbids commercial use |
  | MiniStack | MIT, Python, v1.5.29 (2026-10-17), releases every 1–3 days, images ~110 MB lean and ~360 MB full uncompressed |
  | MiniStack S3 | multipart, versioning, event notifications; verifies SigV4 presigned GET and PUT (source and tests; not yet run live) |
  | MiniStack SQS | DLQ redrive validated against `maxReceiveCount`; FIFO dedupe in a 300 s window; SQS event source mappings for Lambda |
  | `@effect-aws/client-s3`, `client-sqs` | 2.0.0 (2026-10-02), peer `effect >=4.0.0-beta.66 <5.0.0`; install under Bun 1.4.3, pass `tsc` 7 strict, presign on Bun in a scratch run; pull `@aws-sdk/client-*` 3.1152.0 |
  | Effect | no first-party SQS or S3 module in `effect@4.0.5` or `@effect/*` |
  | `PersistedQueueStore` | `offer({ name, id, element, isCustomId, delay? })`, `take({ name, maxAttempts, retryDelay })` in a `Scope` whose finaliser acknowledges (complete, retry, fail; interrupt releases without counting the attempt), `cleanup`; dedupe by id outlives completion |
  | SQS | standard queue with idempotent workers is AWS's advice for distributing tasks; FIFO dedupe lasts 5 minutes; `ApproximateReceiveCount` counts receives not deleted; a message timer is at most 15 min, visibility timeout at most 12 h, a message at most 1 MiB |
  | Changing visibility to 0 | releases a message, but its receive count has already grown: an interrupt costs an attempt on SQS |

- **Terms** come from [docs/knowledge/glossary.md](../../knowledge/glossary.md): User, Chat,
  Message, Attachment (bound and unbound). This ticket adds no domain term: buckets, queues and
  the inventory are infrastructure words and stay out of the glossary.

## Scope

- An S3 adapter of `AttachmentStore` that streams uploads, presigns downloads and deletes objects;
  the port changes as far as streaming needs.
- An SQS layer under `QueueClient`, so the queue definitions and handlers stay as they are.
- The garbage collection of unbound attachments older than 24 hours.
- MiniStack run by a Pulumi program in `deployment/local/` (the Docker provider under
  `runtime: bun`); `make up` and `make down`; a provisioner that applies the inventory to
  MiniStack. *Amended in architecture (D13): the compose file the first draft named is replaced
  before it lands.*
- The resource inventory in `packages/aws` (D4) and a drift guard.
- Config areas for AWS in `@app-template/config`; `.env.example` updated.
- The SQLite queue store and the attachment bytes in the file store removed.
- Contract tests of both ports run on the in-memory and the AWS adapters; AWS adapters against
  MiniStack through Testcontainers.
- `docs/knowledge/` updated: how local AWS works, and the stub notes in `deployment/CLAUDE.md` and
  `deployment/local/README.md`.

## Out of scope

- Pulumi on AWS, Lambda packaging, IAM, real AWS accounts, MiniStack running Lambdas:
  `aws-deployment` (9).
- Postgres, the outbox and the move of chat metadata out of `KeyValueStore`: `postgres-drizzle`
  (4).
- Presigned uploads from the browser; a CDN in front of downloads.
- Assistant-produced attachments: `llm-providers` (6).

## Requirements

### Attachments in S3

- **R1** — WHEN `POST /attachments` passes the limits of `chat-core` R20, THE SYSTEM SHALL write
  each file's bytes to the attachments bucket as a stream, without holding the whole file in
  memory, and its metadata as today.
- **R2** — IF a file breaks a limit of `chat-core` R21 or the upload fails part-way, THEN THE
  SYSTEM SHALL answer as `chat-core` R21 does and leave neither an object nor a record behind,
  including the parts of an unfinished multipart upload.
- **R3** — WHEN `GET /attachments/:attachmentId/download` addresses an attachment of the user,
  THE SYSTEM SHALL answer `302` to a presigned GET URL that expires after 5 minutes and makes S3
  serve the bytes with the attachment's media type and `inline` disposition.
- **R4** — IF the attachment does not exist or belongs to another user, THEN THE SYSTEM SHALL
  answer `404 AttachmentNotFound` as today and issue no URL.
- **R5** — WHEN an attachment is removed (`chat-core` R9, R23), THE SYSTEM SHALL delete its
  object from the bucket.
- **R6** — WHEN the worker builds a prompt (`chat-core` R17), THE SYSTEM SHALL read each
  attachment's bytes from the bucket.
- **R7** — WHEN an attachment has stayed unbound for 24 hours, THE SYSTEM SHALL treat it as not
  found, delete its record when it is next addressed, and leave its object to a bucket lifecycle
  rule that expires unbound objects after one day; a bound attachment SHALL never be collected.
  *Amended in architecture (D9): `KeyValueStore` cannot list, so a sweep of untouched records
  waits for ticket 4; MiniStack stores lifecycle rules but never runs them.*

### Jobs on SQS

- **R8** — WHEN a job is sent, THE SYSTEM SHALL put it on the standard SQS queue of its queue
  definition.
- **R9** — WHEN a job is delivered more than once, THE SYSTEM SHALL end in the same state as after
  a single delivery.
- **R10** — WHILE a handler runs, THE SYSTEM SHALL keep its job invisible to other consumers,
  however long the handler takes.
- **R11** — IF an attempt fails and attempts remain, THEN THE SYSTEM SHALL make the job visible
  again after the definition's retry delay.
- **R12** — THE SYSTEM SHALL give each handler its attempt number and whether it is the last one,
  counted from the queue's receive count against the definition's `maxAttempts`.
- **R13** — IF a job has been received `maxAttempts` times and is still not complete, THEN THE
  SYSTEM SHALL move it to the definition's dead-letter queue without calling the handler again.
- **R14** — IF a message on a queue does not decode as its definition's job, THEN THE SYSTEM SHALL
  move it to the dead-letter queue without calling the handler.

### Resources and local environment

- **R15** — THE SYSTEM SHALL describe every bucket, queue and dead-letter queue, with its
  redrive policy and lifecycle rules, in one plain-data inventory in `packages/aws`, named
  through `buildResourceName`. *Amended in architecture (D4): the layers may not import
  `deployment`.*
- **R16** — WHEN `make up` runs, THE SYSTEM SHALL start MiniStack and apply the inventory to it;
  a second run SHALL change nothing. `make down` SHALL stop it.
- **R17** — IF a queue definition or the bucket adapter names a resource that the inventory does
  not describe, or the inventory describes one no code addresses, THEN `make check` SHALL fail.
  *Amended in architecture (D4): definitions read their name and `maxAttempts` from the inventory,
  and an agreement test covers the rest.*
- **R18** — WHEN `make dev` runs with MiniStack up, THE SYSTEM SHALL serve uploads, downloads and
  both jobs through MiniStack, with no SQLite queue file and no attachment bytes under `.data/`.
- **R19** — IF the api or the worker cannot reach the bucket or a queue at startup, THEN THE
  SYSTEM SHALL exit with an error that names the endpoint and the resource.
- **R20** — THE SYSTEM SHALL read its AWS settings only through `@app-template/config` layers:
  `AWS_REGION`, `STAGE`, and `AWS_ENDPOINT_URL` when set; credentials SHALL come from the SDK's
  default provider chain; bucket and queue names SHALL come from the inventory and the stage.
  `.env.example` SHALL list these variables with MiniStack's `AWS_ACCESS_KEY_ID` and
  `AWS_SECRET_ACCESS_KEY`, and drop `QUEUE_SQLITE_PATH`, `S3_ENDPOINT`, `S3_BUCKET` and
  `QUEUE_URL`. *Amended in architecture (D10): a role's rotating token cannot pass through
  `Config`.*

### Tests and docs

- **R21** — THE SYSTEM SHALL run one contract suite per port (`AttachmentStore`, `QueueTransport`)
  against both the in-memory and the AWS adapter; the AWS run SHALL start MiniStack through
  Testcontainers, need no `.env`, and run in `make test` and CI.
- **R22** — WHEN this ticket lands, `docs/knowledge/` SHALL explain the local AWS environment
  (start, reset, inventory, how a new bucket or queue is added), and `deployment/CLAUDE.md` and
  `deployment/local/README.md` SHALL no longer call the local environment a stub.

## Acceptance

| Req | How to verify |
|---|---|
| R1 | Upload a 10 MB PNG through the api against MiniStack: the object exists with the same bytes and was written by a multipart upload; a heap snapshot or adapter spy shows no single 10 MB buffer. |
| R2 | An 11 MB file is `413`; a stream that fails after the first part leaves `ListObjectsV2` and `ListMultipartUploads` empty and no attachment record. |
| R3 | `download` answers `302` with a `Location` on the MiniStack endpoint; fetching it returns the bytes with `content-type: image/png` and `inline`; fetching it after 5 minutes (signed with a past time) is `403`. |
| R4 | The same id under another user's cookie is `404 AttachmentNotFound` with no `Location`. |
| R5 | Deleting a chat with two attachments, and deleting an unbound attachment, leave no object behind. |
| R6 | A worker test against MiniStack: the recorded prompt holds a `file` part with the uploaded bytes. |
| R7 | Under `TestClock`, an unbound attachment aged 24 h is `404` and its record is gone; a bound one of the same age stays; on MiniStack the object carries the `unbound` tag until `keep`, and the bucket's lifecycle rules read back as the inventory states. |
| R8 | Sending each job puts one message on `app-template-<stage>-assistant-message` or `-chat-title`. |
| R9 | Delivering the same assistant-message and chat-title job twice leaves the message and the title as one delivery does. |
| R10 | A handler that runs longer than the visibility timeout is not received by a second consumer. |
| R11 | A handler failing once is received again no earlier than the definition's first retry delay. |
| R12 | A handler failing every time sees attempts `1…maxAttempts`, `isLastAttempt` only on the last. |
| R13 | After `maxAttempts` failures the message is on the dead-letter queue and the handler was called exactly `maxAttempts` times. |
| R14 | A malformed message is on the dead-letter queue and the handler was never called. |
| R15 | The inventory module lists the bucket, two queues and two dead-letter queues with `maxReceiveCount` equal to each definition's `maxAttempts`. |
| R16 | `make up` twice: the second run reports no change; `make down` leaves no MiniStack container. |
| R17 | Adding a queue to the inventory without a definition, or a definition whose name is not in the inventory, makes the agreement test in `make check` fail with the name. |
| R18 | `make up && make dev`: upload, send, poll to `completed`, title appears; `.data/` holds no `queue.sqlite` and no attachment bytes. |
| R19 | `make dev` without `make up`: both processes exit with an error naming the endpoint and the resource. |
| R20 | `git grep` finds no `process.env`, `Bun.env`, bucket or queue name outside config and the inventory; `.env.example` matches R20. |
| R21 | `make test` runs each contract suite twice (memory, MiniStack) and passes without `.env`; CI runs the same. |
| R22 | The knowledge doc exists and is linked from `docs/knowledge/architecture.md`; `git grep -i stub deployment/` finds no local-environment stub note. |

## Open questions

Resolved in [architecture.md](./architecture.md): collection of unbound attachments (D9), the SQS
layer under `QueueClient` (D1–D3), the streaming `AttachmentStore` (D6, D7), the endpoint and
addressing (D10, D11), the provisioner (D5), and where `maxAttempts` lives (D4).
