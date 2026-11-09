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

| Step | Goal | Pass | Kind | Status |
|---|---|---|---|---|
| L1 | Anthropic's answer to two `user` messages in a row, and the Drizzle reads of a message's Runs, each shown by a run | minimal | learn | done |
| L2 | No `jobs` table and no `kernel/job`: a use case sends after its commit, a refused reply send fails the reply, the worker consumes through `packages/queue` | minimal | build | done |
| L3 | The thinnest slice end to end: a send stores the user's message, its Run and the job; the worker drives the Run and writes the assistant's message; the api reads one Run; messages and chats lose their status | minimal | build | in progress |
| L4 | A chat's messages with their Runs, as a reload shows them | minimal | build | todo |
| L5 | A retry after a failed Run, then the play of the whole feature | minimal | build | todo |
| L6 | Right: the decisions, design and architecture the play and the reviews change | right | build | todo |
| L7 | Later: the items of the open list the owner picks | hard | build | todo |

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

### Output

No `jobs` table and no `kernel/job`: a job is a queue message. `QueueSender.send(definition,
message)` encodes by the definition's schema; `QueueConsumer.consume(definition, handle)`
decodes, and logs and acknowledges a body that does not decode; the worker handler picks the
queue by the records' `eventSourceARN`. `create` commits its writes, then sends; a refused send
dies (`500`). A failed handler settles its own record; only a defect returns the message to the
queue. Until L4, a reply stuck after the commit (a crash, an abort, a refused send) stays queued
and its chat busy, and no record keeps a reply's provenance; the gaps are in Later.
Visible: `bun --bun vitest run --project e2e apps/e2e kernel/aws/__e2e__/queue.sender.e2e.ts`
(8 + 2 cases).

## L3 — The thinnest slice: a send answered through a Run

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

Send and worker:
- `GenerateAssistantMessageUseCase` exposes `generate` (handle) and `fail` (onFail); its own
  `onExit` goes. A model error or refusal is a normal outcome: `handle` writes the Run failed and
  the job ends `done`. `done` writes the assistant message and the Run's `done` in one transaction.
- `POST /chats/:chatId/messages` -> 202, the user's message with its Run (queued); 409 busy.
- Busy: the use case reads the active Run and answers 409; the index catches two sends at once,
  the loser rolls back whole, as today.

API (`http-api/chat/chat.http.ts`):
- `GET /chats/:chatId/runs/:runId` -> the Run; `assistantMessage` once `done`. The client polls.
- `GET /chats/:chatId` keeps its shape; its status is derived. `failure.cause` never leaves the api.

### Notes

[N:ai] The owner's word in L0.5: the steps are vertical slices. This one is the thinnest path end
to end and holds the old L3 (the `runs` table, the `Run` model, `RunRepository` with its memory
fake), the old L4 (the send and the worker on a Run) and the read of one Run from the old L5.
Visible: the play below, the api e2e of a send answered and failed through a Run, `make check`.
[N:ai] Play: `make up`, `make dev`, then `POST /chats/:chatId/messages` -> 202 with its Run
queued; `GET /chats/:chatId/runs/:runId` until `done`, with its assistant message.
[N:ai] Agent's choices, the owner may overturn: `provenance` is `jsonb not null` (`provider`,
`model`, `instructionsHash`, the fields of `ReplyProvenance`,
`application/chat/domain/assistant.port.ts:38`): only the api makes a Run, and it always holds
`CurrentReplyProvenance`; the job's `Option` exists only for bodies queued before the field
(`application/chat/services/chat.queue.ts:16`). `RunRepository` has `insert`, `update`,
`selectOne`, the `where` by `id`, `chatId`, `userId`, `status`; no `selectMany`, since L4 reads a
message's Runs through the message. The message's failure reasons, failure JSON, transitions and
`MessageStatusInvalidError` move to the Run in this step.
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
[N:ai] L2's new Shape leaves the first two lines of "Send and worker" stale: no `onFail`, the
use case keeps its own `onExit`, and the send runs after the commit (a refused one dies, `500`,
the Run left queued: an item of Later).
[N:ai] Docs in this step's commits: `docs/knowledge/glossary.md` (Run, Run status, Active run;
Message, Message status, Active message, Chat status, Status, Provenance), `database.md`,
`decisions.md` › "Jobs as a table in the data layer" (onFail, the job's id), `roadmap.md`
entry 22 ("The message keeps its own status", "A run needs no status of its own").

[Q:ai] Rail 5, question 2 (already in the code?): `.claude/rules/deep-modules.md:61` says a value another table implies is a column the transactions that change it move, not derived on each read; the Shape's `chats` line (`:72`) derives the chat's status from its latest Run. Keep `chats.status`, moved by the send and the worker as today, the busy check and its race guard as they are? Without it: a `latestRun` relation on every chat read, a status derived in the api, and the busy check moved to the Runs.
[N:ai] The owner's word on the first `[Q:ai]` above: the chat's status is driven from its latest Run, not a column; the agent chose the read: a `latestRun` relation on every chat read (one lateral join) and a pure `buildChatStatus` in the model.
[Q:ai] Rail 5, question 1 (what breaks if removed?): in L3 no reader needs a message's Run nested (`UserMessage.run`, `AssistantMessage.run`, `:77`); the list that does is L4. Keep one `Message` with `runId: Option<RunId>` in L3, the assistant message reached from its Run (`RunEntity.assistantMessage`, one relational query) for `GET /chats/:chatId/runs/:runId`, and nest the Runs into messages in L4?

[N:ai] The owner's word on the second `[Q:ai]`: one `Message` class with `runId`, no `UserMessage` and `AssistantMessage`; `GET /chats/:chatId/runs/:runId` answers the Run with its user message and its assistant message.

### Pieces

[N:ai] L3.2 The `runs` table and `RunEntity`, beside today's messages; `init` regenerated · visible: `bun --bun vitest run --project e2e kernel/data/__e2e__/chat/run.entity.e2e.ts` (2 cases)
[N:ai] L3.3 `RunRepository`'s contract: `insert`, `update`, `selectOne` over `RunEntityWhere`, its e2e as `it.effect.fails` over `Effect.die('todo')`; 185 lines, rail 4 lifted by the owner for this piece · visible: `bun --bun vitest run --project e2e kernel/data/__e2e__/chat/run.repository.e2e.ts` (3 expected fail)
[N:ai] L3.4 `RunRepository`'s body: `insert` skips a second active Run by the partial index and dies, `update` writes under its `where` and dies on a miss, `selectOne` reads the newest Run; `runs` joins the relations · visible: the same e2e, 3 passed
[N:ai] L3.5 (OWNER) `encodeWhere` of `RunRepository` and `MessageRepository` at module level, as in the other repositories: the owner's subquery is built by Drizzle's standalone `QueryBuilder`, so it needs no `db` · visible: `bun --bun vitest run --project e2e kernel/data/__e2e__/chat/run.repository.e2e.ts kernel/data/__e2e__/chat/message.repository.e2e.ts` (14 passed)
[N:ai] L3.6 The `Run` model's contract: `Run`, `RunStatus`, `ActiveRunStatus`, `RunFailure`, `RunId`, `RunStatusInvalidError`, and `buildRun`, `isActiveRun`, `isStartedRun`, `prepareRun`, `generateRun`, `completeRun`, `failRun` over bodies of `Effect.die('todo')`; its test checks each move from each status; 220 lines (94 code, 126 test), rail 4 lifted by the owner for this piece · visible: `bun --bun vitest run application/chat/__tests__/domain/run.model.test.ts` (28 expected fail)
[N:ai] L3.7 The `Run` model's body: `buildRun` builds a queued Run, `isActiveRun` and `isStartedRun` read the status, the four moves go through one `transitions` table and `failRun` takes its sentence from `failureMessages` · visible: the same test, 28 passed
[N:ai] L3.8 The memory fakes' owner where and one-active-per-chat index check become one function each, `holdsChildWhere` and `holdsOneActivePerChat`, so the Run fake shares them with the message fake · visible: `make test-unit` (276 passed)
[N:ai] L3.9 `RunRepositoryTest` over `RunRows`, in `RepositoryStackTest`: the primary key, the where with the owner through the chat, the set fields, one active Run per chat, the newest Run first, and a chat's delete takes its Runs; no test of its own (`.claude/rules/effect-tests.md`), a throwaway run of those cases passed and was deleted · visible: the use cases' unit tests once they read Runs
[N:ai] L3.10 `RunFromEntity` and `encodeRun` in a mapper of their own, `application/chat/services/run.mapper.ts` (the owner's word); `decodeRun` lands with its first caller · visible: `bun --bun vitest run application/chat/__tests__/services/run.mapper.test.ts` (5 passed)
[N:ai] L3.12 The cut to Runs, rail 4 lifted by the owner (variant B): messages lose `status`, `error`, `updated_at` and gain `run_id`; chats lose `status`, read with their newest Run; a Run nests its user message and its reply; the send stores the user message and its queued Run, the worker moves the Run and writes the reply with its `done`; `POST /chats/:chatId/messages` answers the Run, `GET /chats/:chatId/runs/:runId` reads it; `runs` moved into `message.table.ts`, since the two tables reference each other; `init` regenerated. 63 files, +1872 −1999 (55 without the migration, the OpenAPI snapshot and the docs: +1148 −1514) · visible: `make check` (251 unit, 88 e2e), `bun --bun vitest run --project e2e apps/e2e/api/chat.e2e.ts` (8 passed); the play: `make reset && make up`, `make dev`, then the Notes' play with `runId`
[N:ai] L3.13 (OWNER) The send composes its writes from the services that own them: `MessageService.create` stores the user's message, `FileAttachmentService.getMany` reads the live, stored attachments and `bind` binds them, `RunService.create` stores the queued Run; `store` keeps the checks and four calls, and a first message is a chat with no Run yet · visible: `make check` (251 unit, 88 e2e)
[N:ai] L3.14 (OWNER) The send reads as its flow, from the owner's sketch: the checks and the reads, then `storeUserMessage` (the message, its bind and its Run in one transaction), then the sends; the reads leave the transaction, as the writes' guards decide the races · visible: `make check` (251 unit, 88 e2e)
[N:ai] L3.15 (OWNER) `storeUserMessage(userId, chatId, input)` reads the attachments, refuses a bound one, stores the message and binds them, answering the new `Message`; `create` starts its Run by `runService.create` on the chain, under one `transaction.run` · visible: `make check` (251 unit, 88 e2e)
[N:ai] L3.16 (OWNER) The owner renamed the step `storeUserMessage` to `createUserMessage` · visible: `make check` (251 unit, 88 e2e)
[N:ai] L3.17 (OWNER) `runs` in its own `run.table.ts`; the Run names its reply by `assistant_message_id` (`runs_assistant_message_id_check`, `_unique`), `messages` loses `run_id`; e2e for both checks, `runs_failure_check` and the key over the message and its chat · visible: `make check` (251 unit, 90 e2e)

### Output

<Proposed by the agent, accepted by the owner. A build step: the code accepted and how to see it.>

## L4 — A chat's messages with their Runs

Budget: waits for the owner

### Shape

API (`http-api/chat/chat.http.ts`):
- `GET /chats/:chatId/messages` -> messages in `created_at, id` order; a user message carries its
  latest Run, an assistant message its Run. One query: a lateral join for the latest Run.

### Notes

[N:ai] Visible: the api e2e of a reload mid-Run: the list shows the active Run.
[N:ai] Today: no route lists a chat's messages; `createMessage` answers
`{ userMessage, assistantMessage }` with `202`, and `getMessage` reads one
(`http-api/chat/chat.http.ts:115-138`).

### Pieces

<[N:ai] L4.1 <what it gives> · visible: <command or link>>

### Output

<Proposed by the agent, accepted by the owner. A build step: the code accepted and how to see it.>

## L5 — The retry, then the play

Budget: waits for the owner

### Shape

API (`http-api/chat/chat.http.ts`):
- `POST /chats/:chatId/runs { userMessageId }` -> 202 a new Run; 409 unless it is the chat's last
  user message, its latest Run failed and no Run is active.

### Notes

[N:ai] Visible: the api e2e of a retry after a failed Run; then the owner plays the whole feature.

### Pieces

<[N:ai] L5.1 <what it gives> · visible: <command or link>>

### Output

<Proposed by the agent, accepted by the owner. A build step: the code accepted and how to see it.>

## L6 — Right

<What the play and the reviews of L3-L5 change in the decisions, design and architecture.>

## L7 — Later

<The items of Later the owner picks.>

## Knowledge

<Only an accepted [D] or Output, written in the commit that settles it.>

- L1: two user messages in a row reach Anthropic as one user turn (`@effect/ai-anthropic` 4.0.6
  folds them); the chat's history keeps any order of messages, the adapter unchanged.
- L1: a message's latest Run is a Drizzle `one` relation with an `orderBy` (one lateral join,
  `{…} | null`); an assistant message's Run a `one` over `messages.run_id`; the two tables import
  each other with `messages.run_id` typed `(): AnyPgColumn`.
- L2: a job is a queue message, sent after the commit of the record it names; no table tracks
  it, and the work's own record holds its status and failure.
- The owner, for this ticket: the code stays minimal; a known gap, an issue or an edge case goes
  to Later at the end of this file with its `path:line`, never a `TODO` in the code.

## Numbers

<At the close, from git: time from the intent to the PR; lines against each step's budget; lines
reworked after the owner saw a piece (the OWNER rounds); stops by signal; claims without a
source.>

## Later

<The open list (`.claude/rules/sdd.md › Gates`): what the minimal feature leaves, edge cases,
hardening, open questions and optimisations, each with its `path:line` or step and its fate (open,
done in L<n>, a roadmap entry, dropped); a hard step takes one on the owner's word.>

- [N:ai] L2: a refused send, a crash or an aborted request between the commit and the send leaves
  the reply queued and its chat busy for good; the reply's Run has to settle it (L4).
  `application/use-cases/chat/create-user-message.use-case.ts:152`, the `queue.send`.
- [N:ai] L2: a queue body that does not decode is logged and acknowledged, so the work it named
  stays as it was (a queued reply keeps its chat busy). `packages/queue/queue.consumer.ts:49`,
  the `onFailure` arm.
- [N:ai] L2: no record keeps a reply's provenance; only the job's body carries it
  (`application/chat/services/chat.queue.ts:18`). Done in L3.12: the Run keeps it, the job names
  only the Run.
- [Q:ai] L3: `runs.updated_at` has no reader in the L3-L5 Shapes: a stuck Run is found by
  `isStartedRun` when the worker takes it, not by its age, and the client polls the status. Drop
  it, so the transitions take no time? Without it, nobody sees when a Run last moved.
- [N:ai] L3: the composite FK makes a Run's message belong to its chat, but no key checks that the
  message is the user's: a Run on an assistant message passes the store. L4's use case builds a
  Run only from the user message it has just stored; the store stays without that check.
- [N:ai] L3: until the use cases switch to Runs, the failure sentences sit twice, in `failureMessages` of `application/chat/domain/run.model.ts` and of `message.model.ts`; the switch deletes the message's copy with its failure and transitions.
- [N:ai] Rail 4 (`.claude/rules/lab.md`): a piece with a repository's e2e cannot stay within 100
  lines, since the test's setup alone takes about 50 (L3.2: 178 lines, L3.3: 185, L3.6: 220 with 126 of test). Count a piece's
  tests apart from its code, as a plan step counts its docs? For the Right step.
- [N:ai] L3.12: the chat's status is derived on each read from its newest Run, against
  `.claude/rules/deep-modules.md:61` (a value another table implies is a column the transactions
  move). The owner chose it; the rule or the design changes in the Right step (L6).
- [N:ai] L3.12: L1's Output said `message.table.ts` and `run.table.ts` import each other; Biome's
  `noImportCycles` refuses that. Done in L3.17: the Run names its reply
  (`runs.assistant_message_id`), so only `run.table.ts` imports `message.table.ts`. Correct the
  L1 line in Knowledge at the lab's close.
- [N:ai] L3.17: the reply is written before the Run's `done`, which names it, so the memory
  `TransactionTest` keeps a lost race's reply that Postgres takes back; no e2e runs a worker's lost
  race (`application/use-cases/chat/generate-assistant-message.use-case.ts`, `settleCompleted`).
- [N:ai] L3.12: a local database migrated with the old `init` needs `make reset && make up`; a job
  body queued before the cut (`messageId`) no longer decodes and is logged and acknowledged
  (`packages/queue/queue.consumer.ts:49`).
- [N:ai] L3.12: the memory fakes check no foreign key, so a unit test may store a Run whose user
  message is missing, or an assistant message whose Run is (`kernel/data/__tests__/testing/chat.test-fake.ts`),
  as the message fake never checked its chat.
- [N:ai] L3.12: `TransactionTest` is the identity, so a unit test sees a write that Postgres would
  roll back; the completion writes the Run first, so its lost race leaves no reply in memory
  either (`application/use-cases/chat/generate-assistant-message.use-case.ts`, `settleCompleted`).
- [N:ai] L3.16: `createUserMessage`, a step that stores, against `.claude/rules/naming.md`, which
  keeps `create<Thing>` for a factory that wires dependencies
  (`application/use-cases/chat/create-user-message.use-case.ts:59`). The rule or the name changes
  in the Right step (L6).
