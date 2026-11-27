# Queue events

Flow: lab · Base: `refactor/worker-job-handlers` (PR #81, head 38135262d5)

## Intent

The owner's words (2026-11-27):

- "Different modules could handle same event but in different way. We should allow it."
- "What if we skip sqs retry? If we need retry we will do it inside process."
- On the shown `consumeQueue` over a list of handlers, a defect only logged: "Yes, implement it.
  And then UserMessageCreated."

## Map

| Step | Goal, and how to see it | Pass | Kind | Status |
|---|---|---|---|---|
| L1 | A queue's message runs every handler its route lists, each ending alone; a record the worker saw to its end is acknowledged · visible: `make test-unit` on `packages/queue` and `apps/worker` | minimal | build | in progress |
| L2 | A new chat's first message is sent as the event `FirstMessageCreated`, which the title's handler listens to; the reply stays a command · visible: `make test-e2e`, the chat journey | minimal | build | in progress |
| L3 | Later: the items of the open list the owner picks | hard | build | todo |

## L1 — Several handlers of one message

### Shape

The owner accepted this signature and body as shown (2026-11-27):

```ts
export function consumeQueue<A, I, R>(
  definition: QueueDefinition<Schema.Codec<A, I>>,
  handlers: Arr.NonEmptyReadonlyArray<(message: A) => Effect.Effect<unknown, never, R>>,
): (event: SqsEvent) => Effect.Effect<SqsBatchResponse, never, R>
```

Each handler runs under its own `Effect.exit`, all of a record's concurrently; one that dies is
logged (`queue message failed`) and leaves the others running. The response's `batchItemFailures`
is always empty, so SQS delivers a record again only when the process died under it, and then
every handler runs again: each is safe to run twice. A handler keeps no error channel. The
worker's route lists a queue's handlers; the chat's two jobs keep one handler each in this step.

### Notes

- [D] A handler's defect is logged and its record acknowledged; no dead-letter for it. The
  owner's "Yes" to: "defect только в лог, без DLQ".
- [N:ai] The decisions this rewrites: Jobs as queue messages (a defect returns the record), Use
  cases above the modules ("no events … between modules") waits for L2.
- [D:ai] A record whose handler died is returned in `batchItemFailures` again, so SQS delivers it
  up to `maxReceiveCount` and then dead-letters it; every handler of it runs again. Claimed by
  the Hunt pass, `packages/queue/queue.consumer.ts:50`: every repository dies on a store error
  (`orDieWithSqlError`), so a connection reset under `runs.getOne`
  (`application/chat/services/reply-chat.service.ts:89`) is acknowledged with the Run left
  `queued`, and one under the answer whose `failed` write dies too leaves it `generating`
  (`reply-chat.service.ts:101`); the chat then refuses every ask, and nothing repairs it. Without
  it the system loses the only repair of a Run a passing store outage left active.

### Output

## L2 — The chat's `FirstMessageCreated`

### Shape

Accepted by the owner (2026-11-27, "1,2 - OK") as proposed:

```
ask   ──send ReplyToMessage──────▶ queue reply-to-message ──▶ replyToMessage   a command, as it is
retry ──send ReplyToMessage──────▶
ask   ──send FirstMessageCreated─▶ queue first-message-created ──▶ titleChat   an event, a new chat's
```

- The reply stays the command `ReplyToMessage`: unheard, the Run stays queued, and its sender
  settles a refused send, so it is no event. `UserMessageCreated` and `RunCreated` are not sent.
- `FirstMessageCreated { id, chatId, userId }`, ids only, sent by `ask` after the commit where the
  chat is new, as the title's job is today; it replaces `TitleChat` and its queue.
- The title's handler listens to it; `TitleChatService.title` reads that one message by
  `{ id, chatId, userId }` and writes the title of that user's untitled chat.
- An event is a fact with a list of listeners, none required; a job is a command with one handler.

### Notes

- [A] The owner on a title that listens to every user message: "it is wrong I belive, in ask just
  emit title event … or rename it FirstChatMessgeCreate or somethinkg like this and in ask check
  and emit."
- [A] The owner on the fields: "In this case I believe we could send ids, id chatId userId."
- [N:ai] A queue's name changes only as a new queue: `title-chat`'s unconsumed messages are lost
  at the switch.
- [N:ai] L2 rewrites the Rejected line "one event for two consumers needs a fan-out" of Jobs as
  queue messages, "no events … between modules" of Use cases above the modules, and the
  glossary's ban of "event".

### Output

## Knowledge

## Later

- A dead-letter queue now fills only from a process that died three times under one record: is
  its redrive still worth its resources? — `kernel/aws/resources/resources.ts:17-27` — open
- The moved handler test asserts the Run's rules, which belong in `ReplyChatService`'s test —
  `apps/worker/__tests__/chat/chat.handler.test.ts:42` — open
- The route test's `{ batchItemFailures: [] }` holds whatever the handler does; its fate follows
  L1's `[D:ai]` — `apps/worker/__tests__/worker.handler.test.ts:63` — open
- No test that an interrupt of the worker ends the handling with no response; a probe showed it —
  `packages/queue/__tests__/queue.consumer.test.ts` — open
- The `process <queue>` span ends successful when a handler died; the `queue message failed` log
  names the handler in its cause's trace — `packages/queue/queue.consumer.ts:54` — open
- A handler that interrupts itself is acknowledged — `packages/queue/queue.consumer.ts:50` — open
