# Reply run

Flow: lab

## Intent

A chat works as message -> reply. A user's message starts a Run, the work of answering it; a
successful Run gives the assistant's message. The user sees their message at once and, under it,
the Run's state (queued, preparing, generating), then the reply or an error with a retry, also
after a page reload. A message is finished text with no status; the Run holds the status, the
failure and the attempts. The api writes the user's message, its Run and the job; only the worker
writes the assistant's message. No web UI in this lab: the api and its e2e show it.

## Map

<The only place for a step's status: todo, in progress or done.>

| Step | Goal | Kind | Status |
|---|---|---|---|
| L1 | Anthropic's answer to two `user` messages in a row, and the Drizzle reads of a message's Runs, each shown by a run | learn | done |
| L2 | No `jobs` table and no `kernel/job`: a use case sends after its commit, a refused reply send fails the reply, the worker consumes through `packages/queue` | build | in progress |
| L3 | The `runs` table, the `Run` model and `RunRepository` exist beside today's model, unused | build | todo |
| L4 | A send stores the user's message, its Run and the job; the worker drives the Run and writes the assistant's message; messages and chats lose their status | build | todo |
| L5 | A chat's messages with their Runs, a Run's state with its assistant message, and a retry after a failed Run, through the api | build | todo |

## L1 — Anthropic and the Drizzle reads

### Output

(a) Two user messages in a row pass: `@effect/ai-anthropic` 4.0.6 folds them into one user turn,
and the API combines them anyway. The adapter stays as it is. Proof: a run through
`AssistantLlmFromConfig` on Haiku, both shapes and a file part, Success.
(b) A message's latest Run: `r.one.runs({ from: messages.id, to: runs.userMessageId })`, read
with `{ latestRun: { orderBy: { createdAt: 'desc', id: 'desc' } } }`, one lateral join, `{…} | null`.
An assistant message's Run: `r.one.runs` over `messages.run_id`. `message.table.ts` and
`run.table.ts` import each other once `messages.run_id` is typed `(): AnyPgColumn`. Proof: the
L1.3 run on Postgres.
Can you write the signature now?

## L2 — The jobs go, the send after the commit

Budget: waits for the owner

### Shape

<Drafted by the agent, accepted by the owner in the chat, 2026-11-09; the earlier Shape
(`onFail`, the job's id from its caller) is in git.>

- No `jobs` table, no `JobRepository`, no `kernel/job`: a job is a queue message, and its work
  keeps its own record (the assistant message's status now, the Run from L4). Running once, a
  run that died and a failure stay the use case's, on that record, as today.
- `packages/queue` sends and consumes by a definition: `send(definition, message)` encodes by its
  schema, `consume(definition, handle)` decodes; the kernel only passes the stage's queue name.
  No `jobId` attribute. A body that does not decode is logged and acknowledged.
- The send runs after the commit. A refused reply send fails the assistant message and its chat
  in one write, and the api answers `202` with it; a refused title send is logged. A process that
  dies between the commit and the send leaves the reply active (roadmap entry 22).
- A record the worker does not find was deleted with its chat: skipped, as today.
- The worker handler runs each queue's use case through `QueueConsumer`, picked by the queue in
  the records' `eventSourceARN`.
- Rejected: the send inside the transaction (a delivery before the commit reads no record, and
  without a job row it cannot tell that from a deleted chat); a job row per message beside the
  work's own record (a second status for one piece of work).

### Notes

[N:ai] The owner's plan: both queues move to the object form; a `JobRepository` memory layer.
Visible: the JobConsumer e2e shows onFail before `failed` for a bad body and a defect, not for
success.
[N:ai] Today: the job's id is made in `kernel/job/job.sender.ts:37`, the row written and sent at
`:40-43`; a body that does not decode settles `failed` with nothing else at
`kernel/job/job.consumer.ts:63-67`; the queues are wired at `apps/worker/worker.handler.ts:25-34`.
`apps/worker/__tests__/worker.handler.test.ts:27` hand-writes `Layer.mock(JobRepository, …)`,
the lambda lab's L4 `[D:ai]`: the memory layer replaces it.
[N:ai] Stop (owner's word, "why we need this id?"): L2.2, `JobSender.send`'s `{ id }`, held
uncommitted. Deletion audit: without it `make typecheck` passes and no caller passes an id
(`git grep 'jobs.send('`: `create-user-message.use-case.ts:134`, `:143`); only its own test needs
it. Its use is L4's: an `onFail(jobId, cause)` for a body that does not decode finds the Run by
the job's id alone.
[N:ai] The owner, in the chat: "job should plain as it is, only body jsonb": the job keeps its
own id, and only its body `{ runId }` ties it to the Run. L2.2 dropped unwritten; a second
reading (the id taken from the message by the definition) went with it.
[N:ai] The owner, in the chat: the kernel's jobs wrap the queue but should track no table and
no statuses; each module keeps its own record of the work (the chat's Runs); "just send after
commit". Review: every duty of `jobs` already sits on the work's record
(`generate-assistant-message.use-case.ts:157`, `alreadySettled`, `isStartedReply`, its `onExit`;
the title's `rename` of an untitled chat only) except telling a delivery before the commit from
a deleted chat, which the send after the commit removes. The owner's yes: the send after the
commit, a refused reply send failing the reply with `202`, the jobs gone as this L2 before the
Runs. L2.1's `onFail` goes with `JobConsumer`.
[N:ai] The send, as shown to the owner: `create`'s writes commit under `transaction.run` in a
function of their own, the sends follow; a `QueueError` on the reply's send runs `failReply`, the
assistant message `failed` (`ReplyFailed`) and the chat `failed` in one transaction, and `create`
answers it; on the title's, a warning. `failReply` repeats the worker's `settleWith(failChat)`
pair, about 8 lines, until L4 fails a Run instead. The worker's skip of a missing message
(`generate-assistant-message.use-case.ts:157`) stays as is: after the commit, missing means
deleted.
[N:ai] Pieces planned: L2.5 the send after the commit and `202` with the failed reply (the api
e2e of a gone queue: `500` -> `202`); L2.6 the decode in `packages/queue`, the worker handler on
`QueueConsumer`, `JobConsumer` gone; L2.7 the encode in `packages/queue`, `kernel/job` and
`kernel/data/job` gone, a migration drops `jobs`. Each piece's docs in its commit; the 100-line
limit counts added lines.
[N:ai] Order changed at L2.5: `JobSender` turns a refused send into a defect and writes the row
before it, and `JobConsumer` dies on a job with no row, so the consumer goes first. L2.5 the
decode in `packages/queue` and `JobConsumer` gone; L2.6 the encode there, `kernel/job` and the
`jobs` table gone; L2.7 the send after the commit, `202` with the failed reply. Until L2.7 a
delivery before the commit finds no message and is skipped as a deleted chat, on this branch
only.
[N:ai] L2.7 is 130 added lines of code (renames counted as renames), over the 100 of rail 4; the
callers' switch to `QueueSender` and the moved e2e make most of it.
[N:ai] L2.7: the journey `a sent message with an upload is answered and titled by the worker`
timed out once in 9 runs of `make test-e2e` (15 s poll), green alone 3 of 3. I assume the
delivery before the commit, skipped as a deleted chat; no log confirms it. L2.8 removes that
path.
[Q:ai] L2.7: with `jobs` gone, no record keeps a reply's provenance until L4 puts it on the Run
(`docs/knowledge/ai.md` now says so); the journey's provenance check went with the table. Keep
the gap on this branch, or log the provenance in the reply's use case until L4 (about 2 lines)?
[N:ai] The owner, in the chat: keep the gap; L4 puts the provenance on the Run, and the branch
reaches `main` only after L4.

### Pieces

<[N:ai] L2.1 <what it gives> · visible: <command or link>>

[N:ai] L2.1 `JobConsumer.consume(definition, { handle, onFail })`: onFail before every `failed`,
not on success; one that dies leaves the job unsettled · visible: `bun --bun vitest run
--project e2e kernel/job/__e2e__/job.consumer.e2e.ts` (11 cases); dropping the onFail call turns
4 red
[N:ai] L2.5 `QueueConsumer.consume(definition, handle)` decodes by the definition, logs and
acknowledges a body that does not decode; the worker handler consumes through it; `JobConsumer`
and L2.1's `onFail` gone · visible: `bun --bun vitest run --project unit
packages/queue/__tests__/queue.consumer.test.ts apps/worker/__tests__/worker.handler.test.ts`
[N:ai] L2.6 (the owner: "failed should not return to queue, failed -> set failed status to run")
a handler of `QueueConsumer` has no error channel, so its use case settles a failure itself and
only a defect returns the record; the reply's use case logs a status the model refused · visible:
the same command, the dying handler's record answered
[N:ai] L2.7 `QueueSender.send(definition, message)` encodes by the definition, with no `jobId`;
`QueueSenderOfStage` in `kernel/aws` names the stage's queue; `kernel/job`, `kernel/data/job` and
the `jobs` table gone (`init` regenerated); the send stays last in the transaction, a refused one
a defect, until L2.8 · visible: `bun --bun vitest run --project e2e
kernel/aws/__e2e__/queue.sender.e2e.ts apps/e2e` (2 + 9 cases)
[N:ai] L2.8 (the owner: a failed transaction keeps no record and answers `500`; a send refused
after the commit fails the queued reply, with `202`) `create` commits its writes, then sends; a
reply SQS refuses writes the reply and its chat `failed` (`ReplyFailed`) in one transaction and
answers it, a refused title job is logged · visible: `bun --bun vitest run --project e2e apps/e2e`
(9 cases; the gone queue's case `500` -> `202` with the reply failed); `make test-e2e` 9 of 9
green, the journey's timeout of L2.7 not seen again

### Output

<Proposed by the agent, accepted by the owner. A build step: the code accepted and how to see it.>

## L3 — The `runs` table and the `Run` model

Budget: waits for the owner

### Shape

Data (chat data, `kernel/data/chat/`; domain in `application/chat/domain/`):
- `runs`: id, chat_id (FK chats, on delete cascade), user_message_id, status
  (`queued` -> `preparing` -> `generating` -> `done` | `failed`), failure (jsonb, only when
  failed: reason `ReplyFailed` | `ReplyRefused`, message, cause), provenance, created_at,
  updated_at. FK (user_message_id, chat_id) -> messages (id, chat_id), the pattern of
  `kernel/data/attachment/attachment.table.ts:40-44`. Partial unique index on chat_id where the
  status is active (one active Run per chat, the trick of `messages_chat_id_active_index` today).
  CHECK (status = 'failed') = (failure is not null). Index (user_message_id, created_at).
- `messages`: id, chat_id, author, text, run_id (FK runs, unique), created_at. Drop status,
  error, updated_at. CHECK (author = 'assistant') = (run_id is not null).
- `chats`: drop status; "busy" and "failed" are read from the latest Run.

Domain:
- `Run` (`run.model.ts`) takes the transitions now in `message.model.ts` (prepare, generate,
  complete, fail, `isStartedReply`) under Run names; a retry is a new Run of the same message.
- `UserMessage { …, attachments, run: Option<Run> }` (the latest Run) and
  `AssistantMessage { …, run: Run }` (always done). Both read with the message, as `attachments`
  are (`kernel/data/chat/message.repository.ts:81`, `with: withAttachments`), never written
  through it; a Run changes only through `RunRepository` with the old status in the `where`.

### Notes

[N:ai] The owner's plan: the `runs` table, the `Run` model with its transitions, `RunRepository`
with its memory fake, beside today's model, unused. Visible: `make check`, `make
migration-check`, the repository's e2e. The message and chat columns go in L4, where nothing
reads them any more.

### Pieces

<[N:ai] L3.1 <what it gives> · visible: <command or link>>

### Output

<Proposed by the agent, accepted by the owner. A build step: the code accepted and how to see it.>

## L4 — The send and the worker on a Run

Budget: waits for the owner

### Shape

- `GenerateAssistantMessageUseCase` exposes `generate` (handle) and `fail` (onFail); its own
  `onExit` goes. A model error or refusal is a normal outcome: `handle` writes the Run failed and
  the job ends `done`. `done` writes the assistant message and the Run's `done` in one transaction.
- `POST /chats/:chatId/messages` -> 202, the user's message with its Run (queued); 409 busy.
- Busy: the use case reads the active Run and answers 409; the index catches two sends at once,
  the loser rolls back whole, as today.

### Notes

[N:ai] The owner's plan: the user message + Run + job `{ runId }` with the Run's id; the worker
drives the Run, writes the assistant message on done, fails it in onFail; messages lose status,
chats lose status; provenance on the Run; createMessage answers the user message with its Run.
Visible: the api e2e of a send answered, refused and failed through a Run; the worker test of
onFail.
[N:ai] Today: `application/use-cases/chat/create-user-message.use-case.ts` queues the chat
(`queueChat`), stores the user's message, then the queued assistant placeholder and its job
(`:127-141`), and the title job on the first message (`:142-147`). The worker's use case,
`generate-assistant-message.use-case.ts`, holds `settleWith`, the history read (`:96`),
`isStartedReply` and `onExit` -> `fail`. The job's body carries provenance:
`application/chat/services/chat.queue.ts:11`.
[N:ai] The test `generate dies with the assistant and fails the reply and its chat first`
(`application/use-cases/__tests__/chat/generate-assistant-message.use-case.test.ts:151`) moves
to `apps/worker/__tests__/worker.handler.test.ts`: the use case no longer fails its own Run,
the pair `JobConsumer` + `onFail` does.
[N:ai] L2's new Shape leaves this Shape's first two lines stale: no `onFail`, the use case keeps
its own `onExit`, and the send runs after the commit (a refused one fails the Run, `202`).
[N:ai] Docs in this step's commits: `docs/knowledge/glossary.md` (Run, Run status, Active run;
Message, Message status, Active message, Chat status, Status, Provenance), `database.md`,
`decisions.md` › "Jobs as a table in the data layer" (onFail, the job's id), `roadmap.md`
entry 22 ("The message keeps its own status", "A run needs no status of its own").

### Pieces

<[N:ai] L4.1 <what it gives> · visible: <command or link>>

### Output

<Proposed by the agent, accepted by the owner. A build step: the code accepted and how to see it.>

## L5 — The reads and the retry

Budget: waits for the owner

### Shape

API (`http-api/chat/chat.http.ts`):
- `GET /chats/:chatId/messages` -> messages in `created_at, id` order; a user message carries its
  latest Run, an assistant message its Run. One query: a lateral join for the latest Run.
- `GET /chats/:chatId/runs/:runId` -> the Run; `assistantMessage` once `done`. The client polls.
- `POST /chats/:chatId/runs { userMessageId }` -> 202 a new Run; 409 unless it is the chat's last
  user message, its latest Run failed and no Run is active.
- `GET /chats/:chatId` keeps its shape; its status is derived. `failure.cause` never leaves the api.

### Notes

[N:ai] The owner's plan. Visible: api e2e, including a reload mid-Run (the list shows the active
Run) and a retry after a failed Run.
[N:ai] Today: no route lists a chat's messages; `createMessage` answers
`{ userMessage, assistantMessage }` with `202`, and `getMessage` reads one
(`http-api/chat/chat.http.ts:115-138`).

### Pieces

<[N:ai] L5.1 <what it gives> · visible: <command or link>>

### Output

<Proposed by the agent, accepted by the owner. A build step: the code accepted and how to see it.>

## Knowledge

<Only an accepted [D] or Output, written in the commit that settles it.>

- L1: two user messages in a row reach Anthropic as one user turn (`@effect/ai-anthropic` 4.0.6
  folds them); the chat's history keeps any order of messages, the adapter unchanged.
- L1: a message's latest Run is a Drizzle `one` relation with an `orderBy` (one lateral join,
  `{…} | null`); an assistant message's Run a `one` over `messages.run_id`; the two tables import
  each other with `messages.run_id` typed `(): AnyPgColumn`.

## Numbers

<At the close, from git: time from the intent to the PR; lines against each step's budget; lines
reworked after the owner saw a piece (the OWNER rounds); stops by signal; claims without a
source.>
