# Lambda

Flow: lab

## Intent

The api and the worker run as Lambda functions. They work in dev mode first, and can later extend
to AWS prod. SQS invokes the worker function; the worker does not poll the queue.

[R] How can a local HTTP call to the api send a message to SQS, and SQS then invoke the worker as
a Lambda function? MiniStack should handle this locally.

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
