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
- **It calls a service of its own level only for shared state** (`UserLock`) or a trivial task,
  and the call says why. A `.job` producer is a service of the same level: a service never enqueues.
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
- it needs a critical section across aggregates or one ordering of writes across them;
- keeping it in the service needs an exception to a rule.

Do not wait for the method to grow: the exception is the signal.

## Use cases

- A use case is a `Context.Service` whose `layer` provides the services it composes, so the
  handler sees no requirement. An entry point (handler, worker) calls the use case, never the
  service methods it orchestrates: `ChatService.delete` is a step of `DeleteChatUseCase`, which
  removes the attachments first.
- **All checks precede every write;** a step's own guard may repeat a check the use case already
  made under its lock. Order the writes so a crash and a retry still find what the next write needs
  (attachments while the messages still list them, the chat last).
- **Enqueue after the writes the job reads.** A job lost between insert and enqueue is a known
  risk until an outbox writes both in one transaction.
- Read a set through the port's batch method (`selectByIds`), never one `select` per id in a loop.
- Return the contract's shape (each message with its attachments), so the handler only projects
  each model onto its DTO's fields (`Struct.pick`) and composes nothing.

## Concurrency

- **Lock on the key the invariant spans:** per user when one attachment can reach two chats, not
  per chat. A lock is a service several holders share (`UserLock`), not a private field.
- A lock is not reentrant: the outermost holder takes it, the methods it calls do not.
- It spans one process. Name the database guard that replaces it (a partial unique index, an
  `UPDATE … WHERE` on the free state) in the Risks of the ticket that adds it.
- **Write only the fields you own of a record another process also writes,** and hold a rule in
  the write's `where`, not in a read before it: the send's touch sets `updatedAt` alone, and the
  title job writes only `where` the chat is still untitled.

## Tests

- Test a use case at its Seam on the test database through the `testing/` test layer. A
  concurrency test forces the interleaving with a yielding fake of the port, and a probe that
  removes the lock must turn it red.
