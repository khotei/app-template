---
paths:
  - "application/**/*.ts"
  - "apps/**/*.ts"
---

# Services and use cases

Where a flow lives in `application`. Names: `naming.md`; Effect shapes: `effect-services.md`.

## Services

- **A service is simple, goal-specific and easy to compose.** It composes what lies below it:
  domain rules, ports, adapters, packages.
- **It calls a service of its own level only for shared state or a trivial task,** and the call
  says why. A `.job` producer is a service of the same level: a service never enqueues.
- **One writer per aggregate.** Only an aggregate's own service writes its records; another
  service may read that port for a view (`MessageDetail`), never write through it.
- **Every method is safe on its own,** except a step another aggregate owns (a cascade): its doc
  comment names the use case, and entry points call only that. A method correct only after
  another one ran is a trap for the next caller: guard the invariant inside it, or take a proof
  value only the check returns (`findSendable` → `SendableChat` → `addUserMessage`).

## When a method becomes a use case

Move it to `<verb>-<object>.use-case.ts` as soon as one holds:

- it composes two services of one level, a `.job` producer included;
- it writes a second aggregate (binds attachments, cascades a delete);
- it needs one transaction across aggregates or one ordering of writes across them;
- keeping it in the service needs an exception to a rule.

Do not wait for the method to grow: the exception is the signal.

## Use cases

- A use case is a `Context.Service` whose `layer` provides the services it composes, so the
  handler sees no requirement. An entry point (handler, worker) calls the use case, never the
  service methods it orchestrates: `ChatService.delete` is a step of `DeleteChatUseCase`, which
  removes the attachments first.
- **All checks precede every write;** a step's own guard may repeat a check the use case already
  made.
- **The writes commit in one transaction:** `sql.withTransaction` as a pipeable of the `Effect.fn`
  that holds the writes, then `Effect.catchTag('SqlError', Effect.die)` for its own statements.
  `AttachmentStore` stays outside it: keep the bytes before the row that binds them, and delete
  them before the commit.
- **Enqueue inside the transaction of the writes the job reads:** the api's `QueueClient` is the
  outbox, so a job commits or rolls back with them
  ([database.md › The outbox](../../docs/knowledge/database.md#the-outbox)).
- Read a set through the port's batch method (`selectByIds`), never one `select` per id in a loop.
- Return the contract's shape (each message with its attachments), so the handler only projects
  each model onto its DTO's fields (`Struct.pick`) and composes nothing.

## Concurrency

- **Hold no lock in the process.** A rule two writers could break between a read and a write is
  a database guard in the write itself (a partial unique index, an `UPDATE … WHERE` on the free
  state), and the application turns its answer into the domain error: the reply's insert answers
  `false` (`ChatBusyError`), the bind skips a taken id (`AttachmentBoundError`).
- **Write only the fields you own of a record another process also writes,** and hold a rule in
  the write's `where`, not in a read before it: the send sets the chat's `updatedAt` alone, and the
  title job writes only `where` the chat is still untitled.

## Tests

- Test a use case at its Seam on the test database through the `testing/` test layer.
- A concurrency test runs the rival calls with `Effect.all(…, { concurrency: 'unbounded' })` on
  the real repositories and asserts an outcome that holds whichever call wins; a probe that
  removes the transaction or the guard must turn it red.
- A rollback test has the database refuse one write of the flow (a constraint the test adds)
  where it can, else a fake of the port (`effect-tests.md › Test support`).
