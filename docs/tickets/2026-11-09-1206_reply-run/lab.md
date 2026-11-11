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
| L3 | The thinnest slice end to end: a send stores the user's message, its Run and the job; the worker drives the Run and writes the assistant's message; the api reads one Run; messages and chats lose their status | minimal | build | done |
| L4 | A chat's messages with their Runs, as a reload shows them | minimal | build | done |
| L5 | A retry after a failed Run, then the play of the whole feature | minimal | build | done |
| L6 | Right: the decisions, design and architecture the play and the reviews change | right | build | done |
| L7 | Errors with context: what each error carries, and where more of it would help the client, the log or the operator | right | — | todo |
| L8 | Later: the items of the open list the owner picks | hard | build | in progress |

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

### Output

A send stores the user's message and its queued Run in one transaction and answers `202` with
the Run; the worker moves the Run through `preparing` and `generating`, then writes the reply and
the Run's `done` in one transaction, or the Run's `failed` with its reason.
`GET /chats/:chatId/runs/:runId` reads the Run with its user message and its reply. Messages and
chats lose their status: a chat's is read from its newest Run. Every read nests its neighbours
one level deep, as their `<Name>Columns`: `Run { userMessage, assistantMessage }`,
`Chat { run }`, `Message { run }` (a user's newest Run, a reply's own). The Run names its reply
(`runs.assistant_message_id`), so a retry is a new Run of the same message.
Visible: `make reset && make up`, `make dev`, `POST /users`, `POST /chats`,
`POST /chats/:chatId/messages` -> 202 queued, `GET /chats/:chatId/runs/:runId` until `done` with
its assistant message; `make check` (251 unit, 91 e2e).

## L4 — A chat's messages with their Runs

### Output

`GET /chats/:chatId/messages` lists the chat's messages in `created_at, id` order, each with its
Run: a user message its newest Run, a reply the Run that wrote it (`ApiMessage.run`, a Run
without its messages as `ApiRunFields`); `getMessage` carries the Run too. Another user's chat,
or an unknown one, is `404 ChatNotFoundError`, not an empty list. The contract's files take the
`api-` prefix and split by model as the domain does: `api-<model>.http.ts` keeps only the routes,
`api-<model>.model.ts` the wire shapes, `api-<model>.error.ts` the errors; the wire is unchanged.
Visible: `bun --bun vitest run --project unit apps/api/__tests__/chat/chat.handler.test.ts`
(mid-Run: the queued Run, then the failure without its cause), `bun --bun vitest run --project
e2e apps/e2e` (after the reply: both messages with the done Run), `make api-check`; `make check`
(254 unit, 92 e2e).

## L5 — The retry, then the play

### Output

`POST /chats/:chatId/messages/:messageId/runs` answers 202 with a new queued Run of the message
when the chat's newest Run failed and answers it; a Run not failed or of another message is 409
`RunNotRetryableError`, a Run in work 409 `ChatBusyError`, an unknown or another user's message
404 `MessageNotFoundError`. The failed Run stays as the past try, and the model's history skips
it. Visible: the play in L5's Notes, kept in git (a bad key fails the Run, the retry is done with
its reply, the reload lists both messages with the retried Run), the e2e "a retry after a failed
Run is answered by the worker…", `make check` (263 unit, 93 e2e).

## L6 — Right

### Output

The chat's status stays derived from its newest Run, and `deep-modules.md` lets a model function
derive a value from the one row its read already nests (`decisions.md › Status from the newest
Run`). `naming.md`'s `create<Thing>` names a write that stores a new record beside a factory;
rail 4 counts a piece's tests apart. `buildApiRun` hands the Run as it is, and the wire schema
drops the failure's `cause`. `runs.updated_at` stays. The retry's path names `:userMessageId`
and reads the message with `author: 'user'`: an assistant's id is `404 MessageNotFoundError
{ id, author: 'user' }`, the error carrying the `author` its read asked for (`null` when none).
`README.md › What the example does` tells the Run flow and polls the Run. The race, title and
fake gaps the reviews found stay in Later for L8.
Visible: `bun --bun vitest run --project unit
application/use-cases/__tests__/chat/retry-run.use-case.test.ts
apps/api/__tests__/chat/chat.handler.test.ts`, `bun --bun vitest run --project e2e apps/e2e
kernel/data/__e2e__/chat/message.repository.e2e.ts` (an assistant's id asked as a user's is
none), the README's sequence diagram; `make check` (265 unit, 94 e2e).

## L7 — Errors with context

### Notes

- [N:ai] The owner, in the chat, during L6: look at the error classes and review where more
  information and context inside them would help; kept as an intention, to look at later. The
  kind waits for the step's start ("can you write the signature now?"). Seen in L6.8: 13 domain
  errors (`application/**/*.error.ts`) and their contract twins (`http-api/**/*.error.ts`);
  `RunStatusInvalidError { id, from, to }` names its context, while `MessageInputInvalidError`,
  `UserUnknownError`, `AttachmentTooLargeError` and `AttachmentTypeUnsupportedError` carry none.
- [N:ai] L7 start: the owner skipped the step for now, before its kind was chosen. The survey
  then: `MessageInputInvalidError` covers two reasons alike (`application/chat/domain/message.model.ts:51`,
  `:55`); `AttachmentTooLargeError` names neither the limit nor the file or body
  (`apps/api/attachment/attachment.handler.ts:30`); `AttachmentTypeUnsupportedError` not the type
  sent (`:50`); `RunNotRetryableError` not why; `ChatBusyError` not the Run in work; the
  assistant's errors only `error.message` (`application/chat/infrastructure/assistant.llm.ts:159`);
  `UserUnknownError` stays empty, so no secret reaches a reply or a log. Unchecked: what of an
  error's fields reaches the api's and the worker's logs and spans, a run to make first.

## L8 — Later

### Shape

Drafted by the agent, accepted by the owner in the chat ("ok"):

- The reply's send in `create` and `retry`: on `QueueError`, one `failUnsent(run, error)` for
  both, `failRun` with `ReplyFailed` and the send's error as its `cause`, `runs.update` under
  `queued`, then `RunNotQueuedError { id }`, `503` at the wire. A reload shows the message with
  its failed Run, and the retry takes it.
- The title's refused send is logged; the send answers as it would.
- The worker stays: a handler's failure already fails its Run
  (`application/use-cases/chat/generate-assistant-message.use-case.ts:142`, `:172`).
- What no `catch` reaches (an api that dies or a client that aborts between the commit and the
  send, a body that does not decode, a dead letter) is in `docs/knowledge/roadmap.md › Later`.

### Notes

- [N:ai] The owner, in the chat: "let's don't play with time": no rule by a Run's age. Catch the
  send's error, answer an error and fail the Run, the same on the worker; the errors in the
  middle, where SQS is, go to the roadmap, into one element for whatever any ticket's `Later`
  leaves unresolved (`roadmap.md › Later`, now in `sdd.md › Gates` and the skills).
- [N:ai] The first piece rewrites `decisions.md › Jobs as queue messages` (it rejects "a refused
  reply failed at once"), `layering.md`'s "a send SQS refuses dies" and `database.md › Stuck
  Runs`, and drops the L2.12 pair of `design-examples.md › The owner's stops`, whose stop the
  owner reversed. Moved to the retry's piece, so the record changes once both sends fail a Run.

### Pieces

- [N:ai] L8.2 a reply's job SQS refuses in `create` fails the Run with `ReplyFailed` and answers
  `503 RunNotQueuedError { id }`; a title's is logged, and the send answers its queued Run
  (47 lines of code, 60 of test) · visible: `bun --bun vitest run --project unit
  application/use-cases/__tests__/chat/create-user-message.use-case.test.ts`
- [N:ai] L8.3 the owner's word: the senders are services at the use cases' level,
  `AssistantMessageSender.send(run)` and `ChatTitleSender.send(message)` in
  `application/use-cases/chat/chat.sender.ts`; `create` calls them, the behaviour unchanged, the
  refusal tests move to the senders (96 lines of code added, 38 gone; 66 of test added, 60
  gone) · visible: `bun --bun vitest run --project unit
  application/use-cases/__tests__/chat/chat.sender.test.ts`. The queue definitions stay in the
  module: a use case may not import `kernel/aws`, whose inventory names the queues
  (`docs/knowledge/architecture.md › Dependency rules`).
- [N:ai] L8.4 the retry sends through `AssistantMessageSender`: a reply's job SQS refuses fails
  the new Run and answers `503 RunNotQueuedError`, as a send does. `decisions.md › Jobs as queue
  messages`, `layering.md`, `application/CLAUDE.md`, `architecture.md` and `database.md` name
  the senders; the L2.12 pair leaves `design-examples.md`, its stop reversed (24 lines of code
  added, 12 gone; no test, the senders' own cover it) · visible: `make check` (268 unit, 94 e2e).

## Knowledge

<Only an accepted [D] or Output, written in the commit that settles it.>

- L1: two user messages in a row reach Anthropic as one user turn (`@effect/ai-anthropic` 4.0.6
  folds them); the chat's history keeps any order of messages, the adapter unchanged.
- L1: a message's latest Run is a Drizzle `one` relation with an `orderBy` (one lateral join,
  `{…} | null`); an assistant message's Run a `one` over `messages.run_id`; the two tables import
  each other with `messages.run_id` typed `(): AnyPgColumn`.
- L2: a job is a queue message, sent after the commit of the record it names; no table tracks
  it, and the work's own record holds its status and failure.
- L3: every read nests its neighbours one level deep, as their `<Name>Columns`, through
  top-level relations only; a model's `<Model>Fields` is what a neighbour nests of it. A
  message's Run is read through two relations (`latestRun`, `replyOf`), and a codec in the entity
  file keeps the one its author has.
- L3: the Run names its reply (`runs.assistant_message_id`, unique, set exactly when `done`), so
  only `run.table.ts` imports `message.table.ts`, and a retry is a new Run of the same message.
- L3, L6: a chat's status is read from its newest Run, not a column; `deep-modules.md` lets a
  model function derive a value from the one row its read already nests
  (`decisions.md › Status from the newest Run`).
- L4: a list of another user's chat, or an unknown one, is `404 ChatNotFoundError`, as the chat
  itself is, never an empty list.
- L4: a contract group's files are `api-<name>.<role>.ts`, one `.model` and one `.error` per
  model as the domain splits them, the `.http` only the routes (`naming.md › Files`).
- L5: a retry is a new Run of the user message whose Run is the chat's newest and failed; the
  rule reads the chat's newest Run alone, since only the newest user message ever gets a Run.
- L6: `create<Thing>` is a factory or a write that stores a new record, a domain service's
  `create` and a use case's step over it (`naming.md › Symbols`).
- L6: a lab piece is at most 100 lines of code, its tests counted apart (rail 4).
- L6: `runs.updated_at` stays: it shows when a Run's status or reply was last set.
- L6: a retry names the user message it answers (`:userMessageId`) and reads it with
  `author: 'user'`, so an assistant's id is `404 MessageNotFoundError { id, author: 'user' }`.
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
  `application/use-cases/chat/create-user-message.use-case.ts:152`, the `queue.send`. L4 left
  it, and L5's retry refuses such a chat too (a Run is active): L8, on the owner's word. A
  refused send: in L8. A crash or an abort: moved to `roadmap.md › Later › From reply-run`.
- [N:ai] L2: a queue body that does not decode is logged and acknowledged, so the work it named
  stays as it was (a queued reply keeps its chat busy). `packages/queue/queue.consumer.ts:49`,
  the `onFailure` arm. Moved: `roadmap.md › Later › From lambda-processes` holds it.
- [N:ai] L2: no record keeps a reply's provenance; only the job's body carries it
  (`application/chat/services/chat.queue.ts:18`). Done in L3.12: the Run keeps it, the job names
  only the Run.
- [Q:ai] L3: `runs.updated_at` has no reader in the L3-L5 Shapes: a stuck Run is found by
  `isStartedRun` when the worker takes it, not by its age, and the client polls the status. Drop
  it, so the transitions take no time? Without it, nobody sees when a Run last moved. Kept, on
  the owner's word in L6: it shows when the status or the reply was last set.
- [N:ai] L3: the composite FK makes a Run's message belong to its chat, but no key checks that the
  message is the user's: a Run on an assistant message passes the store. L4's use case builds a
  Run only from the user message it has just stored; the store stays without that check.
- [N:ai] L3: until the use cases switch to Runs, the failure sentences sit twice, in `failureMessages` of `application/chat/domain/run.model.ts` and of `message.model.ts`; the switch deletes the message's copy with its failure and transitions.
  Done: only `run.model.ts:102` keeps them (`git grep failureMessages`).
- [N:ai] Rail 4 (`.claude/rules/lab.md`): a piece with a repository's e2e cannot stay within 100
  lines, since the test's setup alone takes about 50 (L3.2: 178 lines, L3.3: 185, L3.6: 220 with 126 of test). Count a piece's
  tests apart from its code, as a plan step counts its docs? For the Right step. Done in L6.2.
- [N:ai] L3.12: the chat's status is derived on each read from its newest Run, against
  `.claude/rules/deep-modules.md:61` (a value another table implies is a column the transactions
  move). The owner chose it; the rule or the design changes in the Right step (L6). Done in L6.3: the
  rule narrowed, with its record.
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
  in the Right step (L6). Done in L6.4: the rule names the write.
- [N:ai] L4.1: `buildApiRun` picks `reason` and `message` of the failure by hand, yet the wire
  schema `ApiRunFailure` already drops `cause` on encode: with the pick deleted, `tsc` and the
  handler test that asserts no `cause` on the wire still pass, as they do for `buildApiMessage`,
  which L4.1 left without it (`apps/api/chat/chat.mapper.ts:20`). Drop the pick in L6? Done in
  L6.5.
- [N:ai] L4.1: `README.md:22-49` still tells the pre-Run flow (a queued assistant message, a poll
  of `GET /chats/:id/messages/:messageId`); since L3 a send answers its Run, and a reload reads
  `GET /chats/:chatId/messages`. Done in L6.6.
- [N:ai] L5 review (hunt, claimed): a retry checks the chat's newest Run, then inserts; a send of
  a newer message whose Run commits and fails between the two lets the insert pass the active-Run
  index, so the older message holds the chat's newest Run, against `ensureRunRetryable`'s premise
  (`application/use-cases/chat/retry-run.use-case.ts:51`, the read; `:56`, the insert). It needs a
  send and a retry at once and a failure within the gap. Open.
- [N:ai] L5 review (hunt, claimed): two retries of one failed Run (a double click) both pass
  `ensureChatNotBusy`; the active-Run index refuses the second insert, which dies, so the client
  gets a bare `500`, not `409 ChatBusyError` (`kernel/data/chat/run.repository.ts:68`,
  `application/chat/services/run.service.ts:21`). The send has the same; a retry button invites it.
  Open.
- [N:ai] L5 play: a chat whose first Run failed keeps no title for good when the title job failed
  too (the bad key fails both): the retry sends only the reply's job, and a later send sends the
  title's only for a chat with no Run (`application/use-cases/chat/create-user-message.use-case.ts:94`,
  `Option.isNone(chat.run)`). Seen in the play: `title: null` after the retried Run was `done`.
  Open.
- [N:ai] L5: a `make dev` started before a new route answers it `404` with no body, a cookie or
  not, until a restart: the api started at 10:19 answered `POST …/messages/:messageId/runs` with
  `404`, one started after L5.5 with `401`, `409` and `404` as the contract says
  (`apps/api/package.json:13`, `--hot`; I assume `--hot` keeps the server built at start). Open.
- [N:ai] L4 review: `MessageService.getMany` checks the chat, then reads its messages in a second
  query; a delete between the two answers `200 []`, not `404 ChatNotFoundError`, and the next
  read gives the 404 (`application/chat/services/message.service.ts:58`). A domain service opens
  no transaction (`.claude/rules/layering.md`); one query that reads the chat with its messages
  would close it. Open.
- [N:ai] L6.8: the e2e "of two concurrent sends to one chat, one is stored and the other is
  refused, keeping nothing" failed once in `make check` with 2 messages for 1, then passed in
  three runs of its file and the next `make check` (`apps/e2e/api/chat.e2e.ts:205`). I assume the
  worker answered the stored send before the count, so its reply was the second message. Open.
- [N:ai] L8.2: a reply's job SQS refuses sends no title job either, so a first send refused this
  way leaves its chat untitled, as the L5 play's title gap does
  (`application/use-cases/chat/create-user-message.use-case.ts`, the `chatTitleQueue` send). Open.
- [N:ai] L8.2: `failUnsent` lives in `create`, and the retry needs the same; the worker's
  `settleFailed` makes a third copy of "fail the Run under its status"
  (`application/use-cases/chat/generate-assistant-message.use-case.ts:120`). No folder holds a
  function shared by use cases (`docs/knowledge/architecture.md › A use case`). Done in L8.3:
  the senders hold it; the worker's `settleFailed` stays, its reason and source status its own.
