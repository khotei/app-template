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
| L7 | Errors with context: what each error carries, and where more of it would help the client, the log or the operator | right | — | skipped |
| L8 | Later: the items of the open list the owner picks | hard | build | done |

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

### Output

Not run: the owner skipped it at its start (L7.1), before its kind was chosen. Its survey, which
errors carry no context, moved to `roadmap.md › Later › From reply-run`.

## L8 — Later

### Output

A reply's job SQS refuses, in a send or a retry, fails its Run with `ReplyFailed` and answers
`503 RunNotQueuedError { id }`: a reload shows the message failed, with its retry.
`AssistantMessageSender` and `ChatTitleSender` (`application/use-cases/chat/chat.sender.ts`)
settle a refused send, the reply's on its Run, the title's in the log, and log it with the job's
ids. What no catch reaches, and what the lab's Later left, is in
`roadmap.md › Later › From reply-run`. The title gaps and the `make dev` 404 are dropped, and a
lost Run race keeps its `500`. Visible: `bun --bun vitest run --project unit
application/use-cases/__tests__/chat/chat.sender.test.ts`, `make check` (268 unit, 94 e2e).

## Knowledge

<Only an accepted [D] or Output, written in the commit that settles it.>

- L1: two user messages in a row reach Anthropic as one user turn (`@effect/ai-anthropic` 4.0.6
  folds them); the chat's history keeps any order of messages, the adapter unchanged.
- L1: a message's latest Run is a Drizzle `one` relation with an `orderBy` (one lateral join,
  `{…} | null`); an assistant message's Run a `one` over `runs.assistant_message_id`, so only
  `run.table.ts` imports `message.table.ts` (corrected at the close: L3.17 moved the key to the
  Run, since Biome's `noImportCycles` refuses two tables importing each other).
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
- L8: a send SQS refuses is settled in the job's `<Job>Sender` beside the use cases: on the
  work's record when it has one (the reply's Run fails, `503 RunNotQueuedError`), else in the log,
  each with the job's ids.
- L8: what a ticket's `Later` leaves unresolved moves to `roadmap.md › Later`, one section per
  ticket.
- The owner, for this ticket: the code stays minimal; a known gap, an issue or an edge case goes
  to Later at the end of this file with its `path:line`, never a `TODO` in the code.

## Numbers

<At the close, from git: time from the intent to the PR; lines against each step's budget; lines
reworked after the owner saw a piece (the OWNER rounds); stops by signal; claims without a
source.>

- **Time:** 4 days 2 h 53 min, from `L0.1` (2026-11-09 12:06 +0200, `git log --grep='L0.1 '`)
  to PR #29 (2026-11-13 12:59 UTC, `gh pr view 29 --json createdAt`).
- **Rounds:** 105 commits on the branch (`git log --oneline main..HEAD`), 52 of them `OWNER` and
  9 `REVIEW`. By step (the subject search of `commits.md`): L0 9, L1 4, L2 14, L3 31, L4 8,
  L5 13, L6 11, L7 1, L8 14.
- **Lines against budget:** no step named a budget. Code and tests changed by each step's
  rounds, without docs, `openapi.json` and the migration (`git show --numstat` over its
  rounds): L2 +491 −1012, L3 +3231 −2559, L4 +381 −209, L5 +323 −43, L6 +101 −25,
  L8 +322 −129.
- **Rework:** the `OWNER` rounds outside `docs/tickets/`: L0 +293 −64 (the toolkit), L2 +77
  −161, L3 +645 −631, L4 +309 −208, L5 +0 −32, L6 +140 −36, L8 +258 −130.
- **Stops by signal:** 2, both the owner's word (`git log -p` of this file, `[N:ai] Stop (`):
  "minimal working code base, without this massive checks" and "why we need this id?" (L2.2).
- **Claims without a source:** 5 "I assume" claims in this file's history; one refuted by a run
  (the `--hot` 404, L8.11), one fixed on its own reading (the e2e count, L8.10).

## Later

<The open list (`.claude/rules/sdd.md › Gates`): what the minimal feature leaves, edge cases,
hardening, open questions and optimisations, each with its `path:line` or step and its fate (open,
done in L<n>, moved to the roadmap's `Later`, dropped); a hard step takes one on the owner's word.>

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
  Dropped in L8.12, the owner's yes: no race can break it, its one writer, `RunService.create`,
  takes a user message from both callers (the retry reads `author: 'user'`), and a check in
  the store would cost a column on every Run.
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
  Moved to `roadmap.md › Later › From reply-run`.
- [N:ai] L3.12: a local database migrated with the old `init` needs `make reset && make up`; a job
  body queued before the cut (`messageId`) no longer decodes and is logged and acknowledged
  (`packages/queue/queue.consumer.ts:49`). Dropped in L8.12, the owner's yes: a one-off cost of the
  cut, told in PR #29's merge danger; no deployed stack exists.
- [N:ai] L3.12: the memory fakes check no foreign key, so a unit test may store a Run whose user
  message is missing, or an assistant message whose Run is (`kernel/data/__tests__/testing/chat.test-fake.ts`),
  as the message fake never checked its chat. Moved to `roadmap.md › Later › From reply-run`.
- [N:ai] L3.12: `TransactionTest` is the identity, so a unit test sees a write that Postgres would
  roll back; the completion writes the Run first, so its lost race leaves no reply in memory
  either (`application/use-cases/chat/generate-assistant-message.use-case.ts`, `settleCompleted`).
  Moved to `roadmap.md › Later › From reply-run`.
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
  send and a retry at once and a failure within the gap.
  Moved to `roadmap.md › Later › From reply-run`.
- [N:ai] L5 review (hunt, claimed): two retries of one failed Run (a double click) both pass
  `ensureChatNotBusy`; the active-Run index refuses the second insert, which dies, so the client
  gets a bare `500`, not `409 ChatBusyError` (`kernel/data/chat/run.repository.ts:68`,
  `application/chat/services/run.service.ts:21`). The send has the same; a retry button invites it.
  Moved to `roadmap.md › Later › From reply-run`: the owner, "let it be 500 for now".
- [N:ai] L5 play: a chat whose first Run failed keeps no title for good when the title job failed
  too (the bad key fails both): the retry sends only the reply's job, and a later send sends the
  title's only for a chat with no Run (`application/use-cases/chat/create-user-message.use-case.ts:94`,
  `Option.isNone(chat.run)`). Seen in the play: `title: null` after the retried Run was `done`.
  Dropped: the owner, "let's skip title, if it down there will be default": an untitled chat
  shows a default name.
- [N:ai] L5: a `make dev` started before a new route answers it `404` with no body, a cookie or
  not, until a restart: the api started at 10:19 answered `POST …/messages/:messageId/runs` with
  `404`, one started after L5.5 with `401`, `409` and `404` as the contract says
  (`apps/api/package.json:13`, `--hot`; I assume `--hot` keeps the server built at start).
  Dropped in L8.11, not reproduced: a `make dev-api` started at 14:44 answered a route added
  while it ran with `200`, and `404` once the route was removed.
- [N:ai] L4 review: `MessageService.getMany` checks the chat, then reads its messages in a second
  query; a delete between the two answers `200 []`, not `404 ChatNotFoundError`, and the next
  read gives the 404 (`application/chat/services/message.service.ts:58`). A domain service opens
  no transaction (`.claude/rules/layering.md`); one query that reads the chat with its messages
  would close it. Moved to `roadmap.md › Later › From reply-run`.
- [N:ai] L6.8: the e2e "of two concurrent sends to one chat, one is stored and the other is
  refused, keeping nothing" failed once in `make check` with 2 messages for 1, then passed in
  three runs of its file and the next `make check` (`apps/e2e/api/chat.e2e.ts:205`). I assume the
  worker answered the stored send before the count, so its reply was the second message. Done
  in L8.10: the race counts only the user's messages.
- [N:ai] L8.2: a reply's job SQS refuses sends no title job either, so a first send refused this
  way leaves its chat untitled, as the L5 play's title gap does
  (`application/use-cases/chat/create-user-message.use-case.ts`, the `chatTitleQueue` send).
  Dropped with the L5 play's title gap: an untitled chat shows a default name.
- [N:ai] L8.2: `failUnsent` lives in `create`, and the retry needs the same; the worker's
  `settleFailed` makes a third copy of "fail the Run under its status"
  (`application/use-cases/chat/generate-assistant-message.use-case.ts:120`). No folder holds a
  function shared by use cases (`docs/knowledge/architecture.md › A use case`). Done in L8.3:
  the senders hold it; the worker's `settleFailed` stays, its reason and source status its own.
