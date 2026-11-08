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

## Map

<The only place for a step's status: todo, in progress or done.>

| Step | Goal | Kind | Status |
|---|---|---|---|
| L1 | <one goal you can see> | learn \| build | todo |

## L1 — <goal>

Reference: <the example, and how it was run as is> · Budget: reference + <N> lines

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
[Q:ai] Q1: who reads `in-progress`? While the worker runs, SQS already hides the message; if the
function dies at its timeout, the row stays `in-progress` until the next delivery. With no reader,
the system loses nothing without it.
[Q:ai] Q1: `done` has a reader: a second delivery of the same job (at-least-once,
kernel/queue/job.relay.ts:19) skips it. When is `error` set: at each failed attempt, or once SQS
gives up (the last receive, or the dead-letter queue)? Between attempts the job is still due.
[Q:ai] Q3 (a pure function in the model): the order idle -> enqueued -> in-progress -> done/error
is a rule; one pure function over (from, to) beside the table, so the relay and the worker do not
each repeat the check?
[Q:ai] Naming: the tables already say `queued` and `failed` (kernel/data/chat/message.table.ts:31,
kernel/data/chat/chat.table.ts:10); the same words for a job: idle, queued, in-progress, done,
failed?

### Pieces

<[N:ai] L1.1 <what it gives> · visible: <command or link>>

### Output

<Proposed by the agent, accepted by the owner. A learn step: the answer and its proof (a command,
a snippet of at most 20 lines), ending "Can you write the signature now?". A build step: the code
accepted and how to see it.>

## Knowledge

<Only an accepted [D] or Output, written in the commit that settles it.>

## Numbers

<At the close, from git: time from the intent to the PR; lines against each step's budget; lines
reworked after the owner saw a piece (the OWNER rounds); stops by signal; claims without a
source.>
