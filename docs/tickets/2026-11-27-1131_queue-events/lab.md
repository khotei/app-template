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
| L1 | A queue's message runs every handler its route lists, each ending alone; a record the worker saw to its end is acknowledged · visible: `make test-unit` on `packages/queue` and `apps/worker` | minimal | build | done |
| L2 | A new chat's first message is sent as the event `FirstMessageCreated`, which the title's handler listens to; the reply stays a command · visible: `make test-e2e`, the chat journey | minimal | build | done |
| L3 | Later: the items of the open list the owner picks | hard | build | none picked: the open items moved to the roadmap's Later |

## L1 — Several handlers of one message

### Output

`consumeQueue(definition, handlers)` runs every handler of a queue's route on each record's
message, all of a record's at once, each ending alone: one that dies is logged
(`queue message failed`, its cause naming the handler) and leaves the others running. Every
record the worker saw to its end is acknowledged, so SQS delivers one again only when the process
died under it, and then every handler runs again. A route's services are the union of its
handlers'. See it: `bun --bun vitest run --project unit packages/queue apps/worker`.

## L2 — The chat's `FirstMessageCreated`

### Output

`AskChatService.ask` sends, after the commit and for a new chat, the event
`FirstMessageCreated { id, chatId, userId }` on the queue `first-message-created`; the worker's
`titleChat` listens to it, and `TitleChatService.title` reads that one message by its three ids
and writes the title of that user's untitled chat. The reply stays the job `ReplyToMessage`. See
it: `make test-e2e`, "a user's message is answered and titled by the worker".

## Knowledge

- [D] A record whose handler died stays acknowledged; nothing returns to SQS. Now in
  `docs/knowledge/decisions.md` › Jobs as queue messages, with its cost.
- [D] The reply is a job, the first message of a chat an event: unheard, does the system break,
  and does the sender settle a refused send? Yes to either makes it a job. Now in the same
  decision and the glossary's Event.
- [D] An event carries ids; a listener reads the record.

## Later

Every open item moved to `docs/knowledge/roadmap.md` › Later › From `queue-events`.
