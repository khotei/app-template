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
| L2 | `JobConsumer` calls `onFail` before a job settles `failed`, for a bad body and a defect, not for success; the reply job can take its Run's id | build | todo |
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

## L2 — `onFail` in `JobConsumer`, the job's id from its caller

Budget: waits for the owner

### Shape

- A job stays delivery (`kernel/job`, the `jobs` table); a Run is chat data; the use case drives
  the Run and knows no job; `JobConsumer` drives the job and knows no Run.
- `JobSender.send(definition, message, { id })`: the reply job's id is its Run's; body `{ runId }`.
- `JobConsumer.consume(definition, { handle, onFail })`: `onFail(jobId, cause)` runs, inside the
  uninterruptible settle, before a job settles `failed`: a body that does not decode, a defect or
  an interrupt in `handle`. The work first, then the job: if onFail's write dies, SQS delivers
  again and the job is still unsettled.
- Rejected: generic `jobs` with a jsonb body read as Runs (no cascade, the one-active rule and the
  statuses as JSON expressions, a job cleanup breaking chat history).

### Notes

[N:ai] The owner's plan: both queues move to the object form; a `JobRepository` memory layer.
Visible: the JobConsumer e2e shows onFail before `failed` for a bad body and a defect, not for
success.
[N:ai] Today: the job's id is made in `kernel/job/job.sender.ts:37`, the row written and sent at
`:40-43`; a body that does not decode settles `failed` with nothing else at
`kernel/job/job.consumer.ts:63-67`; the queues are wired at `apps/worker/worker.handler.ts:25-34`.
`apps/worker/__tests__/worker.handler.test.ts:27` hand-writes `Layer.mock(JobRepository, …)`,
the lambda lab's L4 `[D:ai]`: the memory layer replaces it.

### Pieces

<[N:ai] L2.1 <what it gives> · visible: <command or link>>

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
