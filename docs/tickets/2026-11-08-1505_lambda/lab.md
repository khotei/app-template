# Lambda

Flow: lab

## Intent

The api and the worker run as Lambda functions. They work in dev mode first, and can later extend
to AWS prod. SQS invokes the worker function; the worker does not poll the queue.

[R] How can a local HTTP call to the api send a message to SQS, and SQS then invoke the worker as
a Lambda function? MiniStack should handle this locally.
  [A:ai] Yes: two researchers each ran the whole path on their own MiniStack 1.5.31 (the pinned
  image, kernel/config/ministack.ts:3). It runs, with these facts:
  - Proxy mode (`MINISTACK_LAMBDA_PROXY_URL` on a function) POSTs each Lambda event to a process
    on the host, so `bun --watch` stays; it wins over every other executor (MiniStack
    `services/lambda_svc.py:5185-5190`, `:5275-5345`). Its timeout is the function's `Timeout`,
    default 3 s (`:5287`): an LLM reply needs it raised.
  - Worker: an SQS event source mapping invoked it 8–31 ms after the send; batch up to 10,
    `ReportBatchItemFailures`, a handler's `ChangeMessageVisibility` and the redrive to the DLQ
    all worked (run; `lambda_svc.py:7591-7621`). On AWS, Lambda Web Adapter (LWA) 1.1.0 posts
    the same event to the same `POST /events` and returns the body as the result (LWA
    `src/lib.rs:470`, `:1549`): one worker route serves both, only config differs.
  - api: a Function URL works locally (run: `POST /_aws/lambda-url/<id>/chats` gave 201), but
    proxy mode hands over the raw event, where LWA hands a plain HTTP request. So locally the
    browser calls the Bun api directly, as today; a Function URL locally needs a dev-only
    adapter (~30 lines, I assume).
  - The api never sends to SQS today: it writes a `jobs` row, and `JobRelay`, a 1 s poll loop
    inside the worker, sends it (kernel/queue/job.relay.ts:47-55, apps/worker/layer.ts:30). That
    loop cannot live in a Lambda the queue invokes; the send has to move (after the commit, plus
    a sweep of unsent rows; EventBridge `rate()` is at least 1 minute, `eventbridge.py:3845`).
  - Differs from AWS: a non-2xx fails an invocation in MiniStack, but in LWA only the codes in
    `AWS_LWA_ERROR_STATUS_CODES` do (default none, `lib.rs:1644-1660`); AWS rejects a function
    timeout above the queue's visibility, MiniStack does not check it (AWS docs,
    services-sqs-configure); `jobId` arrives in camelCase `messageAttributes` (`:7442-7453`).
  - Pulumi: the provider has endpoints only for `rds`, `s3`, `sqs` (deployment/aws/provider.ts:11);
    `lambda`, `scheduler` or `events`, and `iam` need adding. Creating the functions through
    Pulumi against MiniStack was not run (both used boto3 or the SDK).
  - The two differ only in detail: LWA's `/events` result was read in its source by one and
    assumed by the other; an end-to-end LWA run in a Bun image (MiniStack `LAMBDA_EXECUTOR=docker`)
    would settle it. Neither ran anything on real AWS.
  [A:ai] On real AWS (the owner asked in the chat): the same path, each hop a managed service;
  nothing was run on AWS, the facts below are AWS docs and LWA source.
  - SQS invokes nothing itself: "Lambda polls the queue and invokes your function synchronously
    with an event", a batch of up to 10; a failed batch shows again after the visibility timeout
    unless the function returns `batchItemFailures`; delivery is at least once, so the handler
    must be idempotent (docs.aws.amazon.com/lambda/latest/dg/with-sqs.html). Our code still never
    polls.
  - api: a container image (in ECR) with LWA 1.1.0 and the Bun server unchanged, behind a
    Function URL or API Gateway; worker: the same image shape, LWA posting each batch to
    `POST /events`. The send to SQS right after the commit, a 1-minute EventBridge Scheduler sweep.
  - Set `ReportBatchItemFailures` and answer 200 with the failed ids: else a 500 counts as
    success under LWA's default `AWS_LWA_ERROR_STATUS_CODES` and the batch is deleted.
  - A function runs at most 900 s; a mapping is refused when the function timeout exceeds the
    queue's visibility timeout, which deployment/aws/queue.ts does not set yet
    (docs.aws.amazon.com/lambda/latest/dg/gettingstarted-limits.html, services-sqs-configure).
  - A synchronous request or response is at most 6 MB (gettingstarted-limits); the upload limit
    is 10 MiB (http-api/shared/limits.ts:2), so a large upload through the Function URL fails on
    AWS and needs a presigned S3 upload.
  - A function in a VPC (to reach RDS) reaches only that VPC; SQS and the LLM provider need a NAT
    gateway or VPC endpoints (docs.aws.amazon.com/lambda/latest/dg/configuration-vpc-internet.html).
  - Up to 1,000 concurrent environments by default, each with its own Postgres pool: I assume RDS
    Proxy is needed. The cold start of a Bun image is unknown until a run on AWS.
  - The stack does not exist yet: deployment/aws/api.ts, worker.ts, iam.ts hold names only
    (deployment/aws/api.ts:3). Lambda Web Functions ("serverless HTTP servers", 30 s default
    request timeout, gettingstarted-limits) may replace LWA for the api; not studied.

## Map

<The only place for a step's status: todo, in progress or done.>

| Step | Goal | Kind | Status |
|---|---|---|---|
| L1 | MiniStack's SQS mapping invokes the worker's `POST /events` through `queue-2`; a chat reply arrives with no receive loop | build | in progress |
| L2 | A job moves `idle` -> `queued` -> `done` or `failed` in `jobs`; it is sent after the commit, and a sweep resends a lost send | build | in progress |
| L3 | api and worker run on `queue-2`; the old queue, its relay and `sentAt` are gone | build | todo |
| L4 | A send stores the user's message and its job; the worker writes the reply; a failed send shows under the user's message, after a reload too, with a retry | build | in progress |
| L5 | dev runs on the real Anthropic; the e2e answer from a fake Messages API; no stub and no `LLM_PROVIDER` in the app's code | build | in progress |

## L1 — SQS invokes the worker in dev

Reference: a researcher's probe (L0.4), run as is on MiniStack 1.5.31: a Bun server on the host
answers `POST /events`; a proxy-mode function and an SQS mapping with `ReportBatchItemFailures`
invoke it; a failed record retries after the handler's `ChangeMessageVisibility`, then reaches
the DLQ · Budget: reference + 250 lines; spent 967, over (see Notes)

### Shape

```text
api -> SQS -> worker -> handler
```

- Today the worker pulls jobs from SQS itself; it should not. SQS invokes the worker.
- The `jobs` table tracks each job's status:
  1. `idle`: the job is created, not yet sent;
  2. `enqueued`: its message is sent;
  3. `in-progress`: SQS invoked the worker, set before the handler runs;
  4. `done` or `error`: after the handler.

```text
idle -> enqueued -> in-progress -> done | error
```

### Notes

[Q:ai] Q1 (what breaks if removed): `idle` and `enqueued` say what `sentAt` says today, null =
not sent (kernel/data/job/job.table.ts:20, read by the relay at kernel/queue/job.relay.ts:40).
Does `status` replace `sentAt`, or do both stay, two fields that can disagree?
  [A] status (the owner, in the chat).
[Q:ai] Q1: who reads `in-progress`? While the worker runs, SQS already hides the message; if the
function dies at its timeout, the row stays `in-progress` until the next delivery. With no reader,
the system loses nothing without it.
  [A] yes (the owner, in the chat: "1-5 yes").
[Q:ai] Q1: `done` has a reader: a second delivery of the same job (at-least-once,
kernel/queue/job.relay.ts:19) skips it. When is `error` set: at each failed attempt, or once SQS
gives up (the last receive, or the dead-letter queue)? Between attempts the job is still due.
  [A] yes (the owner, in the chat: "1-5 yes").
[Q:ai] Q3 (a pure function in the model): the order idle -> enqueued -> in-progress -> done/error
is a rule; one pure function over (from, to) beside the table, so the relay and the worker do not
each repeat the check?
  [A] yes (the owner, in the chat: "1-5 yes").
[Q:ai] Naming: the tables already say `queued` and `failed` (kernel/data/chat/message.table.ts:31,
kernel/data/chat/chat.table.ts:10); the same words for a job: idle, queued, in-progress, done,
failed?
  [A] yes (the owner, in the chat: "1-5 yes").
[D] Before the send, the job is created `idle`; after the commit (`afterCommit` inside the use
case, a callback that sends) -> send -> `enqueued` (the owner, in the chat).
  [Q:ai] `SqlClient.afterCommit` drops a callback when the process exits before it runs, and logs
  and swallows its failure; Effect says "work that must happen belongs in a table written in the
  same transaction" (repos/effect/packages/effect/src/sql/SqlClient.ts:130-142, :492-498). So a
  failed send leaves the row `idle` forever: does a sweep of `idle` rows resend them (a schedule
  of at least 1 minute on AWS, `eventbridge.py:3845`)?
  [A] yes (the owner, in the chat: "1-5 yes").
  [Q:ai] `withTransaction` waits for the callbacks (SqlClient.ts:135), so the SQS send delays the
  api's response. The one caller is send-message.use-case.ts:79, through `QueueSender.send`
  (kernel/queue/queue.client.ts:37-57): register the callback inside `QueueSender.send`, so the
  use case stays as it is and a second use case cannot forget it?
  [A] yes (the owner, in the chat: "1-5 yes").

[D] Build a new `queue-2` beside the old queue, piece by piece, then switch to it and remove
the old; nothing is committed until the owner says so (the owner, in the chat).
[D] `queue-2` splits by role: `queue.model.ts` (types and pure functions), `queue.sender.ts`
(`QueueSender.send`), `queue.consumer.ts` (`QueueConsumer.consume`, private in its `make`); no
transport service; tests mock `SQSService` (the owner, in the chat).
[N:ai] Budget overrun: 497 of 250 lines (L1.6 176, queue-2 pieces 1 to 2b 321); pieces 2a
(129) and 2b (about 106) over their 100. Proposed: three steps (L1, L2, L3) with budgets 400, 300, 100; waits for the owner.
[D] The worker on `queue-2` starts from an entry point of its own beside the old `main.ts`,
which it replaces in L3 (the owner, in the chat).
[D] No mapping invokes the worker for a dead-letter queue: SQS moves a spent message there on
its own, and the dead-letter handlers go with the old worker (the owner, in the chat).
[N:ai] What that costs: a last attempt cut by the function's timeout leaves its reply in
progress, since no one marks it `failed`.

### Pieces

Contract, accepted by the owner in the chat, then moved to `queue-2` and renamed by the owner:

```ts
// packages/queue-2/queue.consumer.ts: one SQS batch in, the failed records out
QueueConsumer.consume: <A, I, E, R>(
  definition: QueueDefinition<Schema.Codec<A, I>>,
  handle: Handler<A, E, R>,
) => (event: SqsEvent) => Effect.Effect<SqsBatchResponse, never, R>
```

Planned pieces: 1 model and sender · 2a `consume` answers the failures · 2b its retry delay ·
6 the worker's `POST /events` on `queue-2` · 7 the functions and mappings in `make up`.

[N:ai] L1.6 `handleBatch` answers a batch's failed records and hides each for its retry delay, at
once on the last attempt · visible: `bunx vitest run --project unit packages/queue`
[N:ai] queue-2 piece 1: `QueueDefinition` and `QueueSender.send` over SQS.
[N:ai] queue-2 piece 2a: `QueueConsumer.consume` answers the failed records ·
visible: `bunx vitest run --project unit packages/queue-2`
[N:ai] queue-2 piece 2b: `consume` hides a failed record for `retryDelay`, or
for 0 on the last attempt; `QueueClient.getUrl` holds the queue URLs for the sender and the
consumer · about 106 lines, over 100 · visible: `bunx vitest run --project unit packages/queue-2`
[N:ai] queue-2 piece 6a: the worker's `POST /events` runs a batch on the consumer of its queue,
read from the record's ARN, and answers its failures as JSON; a queue with no consumer dies ·
82 lines · visible: `bunx vitest run --project unit apps/worker/__tests__/events.http.test.ts`
[D] Switch now: the worker and the api move to `queue-2`; the old queue, `JobRelay`, the
dead-letter handlers and the lock settings go, and `jobs` gets L2's statuses first (the owner, in
the chat: plan A).
[D] The kernel's side of the queue is `kernel/job`: `JobSender` writes and sends a job,
`JobConsumer` settles it (the owner, in the chat).
[D] The worker's handlers are services, and its route is `WorkerHandler` in `worker.handler.ts`
(the owner, in the chat).
[N:ai] piece 1: the worker serves `POST /events` on `WORKER_PORT`; `make up` creates its function
and one mapping per queue in MiniStack, and the e2e stand its own per stage; the dead-letter
handlers, `QueueConsumerSqs` and `QUEUE_LOCK_*` are gone · +388 −292 lines, over 100: it turned
green only whole · visible: `make up`, the README's chat from the shell, `make test-e2e`

### Output

<Proposed by the agent, accepted by the owner. A learn step: the answer and its proof (a command,
a snippet of at most 20 lines), ending "Can you write the signature now?". A build step: the code
accepted and how to see it.>

## L2 — Job statuses and the send after the commit

Budget: waits for the owner · Planned pieces: 3 `status` in `jobs` and its pure transitions ·
4 the job written `idle`, sent by `afterCommit`, set `queued` · 5 the sweep of `idle` jobs.

### Reference

[N:ai] A schedule in MiniStack 1.5.31, run 2026-11-08 by HTTP (no AWS CLI on the machine):
`AWSEvents.PutRule` `{"Name":"probe-sweep","ScheduleExpression":"rate(1 minute)"}`, then
`AWSEvents.PutTargets` with the worker function's ARN. MiniStack invoked the function every
minute, and its proxy posted the event to the worker's `POST /events`, the same path as the SQS
batches: `{"version":"0","source":"aws.events","detail-type":"Scheduled Event","detail":{},…}`;
with a target's `Input`, that JSON instead. The rule was deleted after the run.

### Pieces

[N:ai] piece 2a: `JobSender` in `kernel/job` writes a job `idle` in the caller's transaction,
sends it by `afterCommit` and sets it `queued`; a failed send leaves it `idle`. `jobs` has
`status` in place of `sentAt` and `job_id`, set by every insert; `JobRelay`, `QueueSenderJobs`,
`kernel/queue` and `QueueConfig` are gone; the use cases may import `kernel/job` (the owner) ·
over 100 lines: it turned green only whole · visible: `make test-e2e`, the `JobSender` e2e
[N:ai] piece 2b: `JobConsumer` in `kernel/job` wraps `QueueConsumer.consume` and settles the
row: `done` on success, `failed` on the last attempt's failure, no change before; a settled job is
a redelivery, acknowledged without its handler; `AttemptInfo.jobId` carries the row; no `running`
status · visible: `make test-e2e`, the `JobConsumer` e2e
[N:ai] piece 2c (the owner, in the chat): `JobConsumer` marks the job `running` before its
handler and `queued` again after a failed attempt that is not the last; `running` joins the
glossary's `Status` as a run in one stage · visible: `make test-e2e`, the `JobConsumer` e2e
"a queued job reads running while its handler runs"
[D] `JobSender.send` writes the job's row in the use case's transaction and answers the step that
sends it to SQS and marks it `queued`; the use case runs that step after the commit,
`jobs.send(<queue>, job).pipe(Effect.flatMap(transaction.afterCommit))`, through the new
`Transaction.afterCommit`, so the sender knows no transaction and any failed write, the job's
included, rolls the whole send back (the owner, in the chat, variant A). Variant B, the whole
send after the commit, was tried: the e2e `chat.e2e.ts` "a send whose title job is refused…"
showed it answers 200 and loses the job.

## L3 — Switch to queue-2

Budget: waits for the owner · Planned piece: 8 api and worker on `queue-2`; the old queue, the
relay and `sentAt` removed.

## L4 — A failed send shows under the user's message

Budget: waits for the owner.

### Pieces

[N:ai] piece 1 (the owner, in the chat): `SendMessageUseCase.send` becomes
`CreateUserMessageUseCase.create` in `create-user-message.use-case.ts`; the contract's `send`
and the type `SentMessages` stay · visible: `make check`
[N:ai] piece 2 (the owner, in the chat): the contract's `send` becomes `createMessage`, beside
`getMessage`, as `create` names the chat's creation; `SentMessages` becomes `CreatedMessages`, and
the use case's comments and test names say create · visible: `make api-check`

### Notes

[N:ai] Stop (the owner's word): piece 1, uncommitted, was rolled back ("let's rollback last
changes"): the send still reserved the reply's id, and the owner wants no trace of the assistant's
message in the use case: it sends an event with the user's message, and the worker's handler
writes the reply and runs it.

[N:ai] The owner, in the chat: as in the agents' chats (Claude Desktop, ChatGPT), a send that
fails shows its error under the user's message, kept after a reload, with a retry; the user's
message is kept even when the send's transaction fails. The use case only sets the chat's status,
stores the user's message and sends the job; the worker writes the assistant's message, and a
failure there is that message's `failed` with its cause.
[N:ai] The owner, in the chat: `SendMessageUseCase` becomes `CreateUserMessageUseCase`
(`create-user-message.use-case.ts`), once it no longer writes the assistant's message.
[R] How do agent chat apps (Claude Desktop and claude.ai, ChatGPT) show a user's message whose
send failed, and what do they keep of it across a reload: the states, the retry, where the state
is stored?
[N:ai] Stop (the owner's word): the researcher on the question above was stopped before it
answered; "no need, just split it as planned".
[Q:ai] Where does a failed send's status live: a status on the user's message (`sent`,
`failed`), written by a second transaction after the first one rolled back, which fails too
when the database is the cause?
[Q:ai] What does the api answer for the reply the worker has not written yet: its id, made by the
use case and carried in the job, with a 404 until the worker writes it, or the chat to poll?
[Q:ai] Who holds "one reply at a time": the chat's `queued`, set by the use case, which a lost
job would leave set?

## L5 — No stub in the app's code

Budget: about 150 lines, mostly deletions (the owner, in the chat: variant A) · Planned pieces:
1 the e2e stand answers from a fake Messages API, reached by an optional `ANTHROPIC_API_URL` ·
2 the stub provider and `LLM_PROVIDER` removed, the docs on the real Anthropic.

### Pieces

[N:ai] piece 1: the e2e stand serves a fake Messages API on a free port, answering each request by
its model (`e2e-reply`, `e2e-title`), and runs the apps with `LLM_PROVIDER=anthropic` and the new
optional `ANTHROPIC_API_URL` naming it, so the e2e go through the real Anthropic adapter; the stub
still exists · visible: `make test-e2e`, `chat.e2e.ts` "a sent message with an upload…"
[N:ai] piece 2 (the owner, in the chat): `.env.example` names `ANTHROPIC_API_URL`, commented out
· visible: `make doc-lint`
[N:ai] piece 3 (the owner, in the chat: "we don't need the API URL, delete it"): the fake Messages
API and `ANTHROPIC_API_URL` go; `WorkerProcess` is the worker but its `Assistant`, which
`WorkerLayer` closes with the language model and the e2e stand with `recordAssistant`'s scripted
answers (variant B); the adapter stays checked by `assistant.llm.test.ts` alone · visible:
`make test-e2e`, `chat.e2e.ts` "a sent message with an upload…"
[N:ai] piece 4 (the owner, in the chat: "only Anthropic for now, nothing switches"): the stub
builder, its canned answers and `LLM_PROVIDER` go; `LlmConfig` reads the key and both models,
`ReplyModelConfig` the reply model, and the provenance names `anthropic` itself; `.env.example`
sets both models and an empty key; six tests of the stub and the provider went with them ·
visible: `make check` (252 unit, 109 e2e), `git grep -i stub -- application kernel packages apps`
finds nothing

### Notes

[N:ai] The owner, in the chat: "move the stub to the test level; the app's code must not use
it", then variant A: a fake Messages API in the e2e stand over the real Anthropic adapter, not
the `Assistant` port's memory layer under a worker layer left open (variant B), which would leave
the adapter unchecked by the e2e.
[N:ai] Two `make dev` side by side ran 2026-11-08 on the real Anthropic: the main tree and the
worktree `N=1` (3010/3011/3012, MiniStack 4576, stage `local1`) each answered and titled its own
chat in 3 s; each worker took its own 2 events, each database holds its 2 jobs `done`.

## Knowledge

- A job's `status` replaces `sentAt` (L1).
- A job is written `idle` in the use case's transaction and sent after the commit, then set
  `enqueued` (L1).
- A job's statuses are `idle`, `queued`, `done`, `failed`: no `in-progress`, since SQS hides a
  message while the worker runs; `failed` is set once SQS gives up, not at each failed attempt;
  one pure function beside the table holds the order of the statuses (L1).
- A schedule resends the jobs left `idle`, since `afterCommit` may drop or fail the send (L1).
- `QueueSender.send` registers the send after the commit, so a use case cannot forget it (L1).
- The worker answers SQS through `handleBatch(definition, handle)(event)`, returning
  `{ batchItemFailures }` (L1).

## Numbers

<At the close, from git: time from the intent to the PR; lines against each step's budget; lines
reworked after the owner saw a piece (the OWNER rounds); stops by signal; claims without a
source.>
