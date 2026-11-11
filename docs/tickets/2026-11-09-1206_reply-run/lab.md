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
| L6 | Right: the decisions, design and architecture the play and the reviews change | right | build | in progress |
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

<What the play and the reviews of L3-L5 change in the decisions, design and architecture.>

### Notes

The candidates from Later that the play and the reviews left for the Right step; each `[D:ai]`
is a proposal until the owner makes it `[D]`.

- [D:ai] 1. The chat's status stays derived from its newest Run (`buildChatStatus`,
  `application/chat/domain/chat.model.ts:51`), and the rule narrows: a value read from the one
  row a read already nests is derived, not a column (`.claude/rules/deep-modules.md:63`, with
  its record in `docs/knowledge/decisions.md`). A `chats.status` column would be a second copy of
  the Run's status, written by each of its five moves in the Run's transaction; the derived one
  costs no query, since `Chat { run }` is already read (L3). Lost without the column: a query
  over chats by status needs the join.
  - [N:ai] The owner, in the chat: A; the models use the function, and the web can derive the
    status the same way. Done in L6.3.
- [D:ai] 2. `naming.md` gains the verb the code already uses: `create`, a domain service's write
  that stores a new record (`ChatService.create`, `MessageService.create`, `RunService.create`,
  `application/chat/services/*.service.ts`), and a use case's step over it; `createUserMessage`
  (`application/use-cases/chat/create-user-message.use-case.ts:59`) keeps its name. The factory
  arm stays: a factory takes dependencies, a write takes the record's fields.
- [D:ai] 3. `buildApiRun` drops its pick of the failure (`apps/api/chat/chat.mapper.ts:20`): the
  wire schema already drops `cause` on encode (L4.1's run of the deletion test).
- [D:ai] 4. `runs.updated_at` goes, with `ApiRunFields.updatedAt`
  (`http-api/chat/api-run-fields.model.ts:25`): no code reads it (`git grep updatedAt` over
  `apps`, `application/use-cases`, `http-api` finds only the wire field), and no client yet. Lost:
  the time a Run last moved; a stuck Run (L7) would want it back, or its own column.
- [D:ai] 5. `README.md:26-49` tells the Run flow: a send answers its Run, the worker moves it,
  a reload reads `GET /chats/:chatId/messages`, a failed Run takes a retry.
- [D:ai] 6. Rail 4 (`.claude/rules/lab.md:55`) counts a piece's tests apart from its code, as a
  plan step counts its docs: a piece with a repository's e2e passed 100 lines in each of L3.2,
  L3.3 and L3.6 on the test's setup alone.
  - [N:ai] The owner, in the chat: yes. Done in L6.2.
- [N:ai] The owner, in the chat, on 4: `runs.updated_at` stays, since it shows when the status
  or the reply was last set.
- [D:ai] To L7, as edge cases and error paths: the title lost after a failed first Run, the two
  retry races, `MessageService.getMany`'s two queries, the memory fakes' missing keys and
  `TransactionTest`, the `--hot` route `404`.

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
- L6: a lab piece is at most 100 lines of code, its tests counted apart (rail 4).
- L6: `runs.updated_at` stays: it shows when a Run's status or reply was last set.
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
  it, and L5's retry refuses such a chat too (a Run is active): L7, on the owner's word.
- [N:ai] L2: a queue body that does not decode is logged and acknowledged, so the work it named
  stays as it was (a queued reply keeps its chat busy). `packages/queue/queue.consumer.ts:49`,
  the `onFailure` arm.
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
  in the Right step (L6).
- [N:ai] L4.1: `buildApiRun` picks `reason` and `message` of the failure by hand, yet the wire
  schema `ApiRunFailure` already drops `cause` on encode: with the pick deleted, `tsc` and the
  handler test that asserts no `cause` on the wire still pass, as they do for `buildApiMessage`,
  which L4.1 left without it (`apps/api/chat/chat.mapper.ts:20`). Drop the pick in L6?
- [N:ai] L4.1: `README.md:22-49` still tells the pre-Run flow (a queued assistant message, a poll
  of `GET /chats/:id/messages/:messageId`); since L3 a send answers its Run, and a reload reads
  `GET /chats/:chatId/messages`.
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
