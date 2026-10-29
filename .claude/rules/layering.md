---
paths:
  - "domain/**"
  - "application/**"
  - "apps/**"
---

# Layering: ports, domain services, use cases, handlers

Where a flow lives. Words: `docs/knowledge/glossary.md › Architecture language`; names:
`naming.md`; Effect shapes: `effect-services.md`.

## Ports and domain services

- **A port speaks the domain's words,** never a client's type or error; its adapter turns a
  failure into a defect (`effect-schema.md`).
- **A domain service is the only writer of its entity's records,** one per entity (`ChatService`
  and `MessageService` for the chat aggregate). It may read another entity's port for a check or
  a read model (`ChatService` reads `MessageRepository`), never write through it.
- It sees its ports, the clock (`DateTime.now`) and `Crypto`; never another domain service, the
  queue or `Transaction`, which are a use case's.
- **Every method is safe on its own,** except a step a use case owns (a cascade): its doc comment
  names the use case, and handlers call only that (`ChatService.delete`, a step of
  `DeleteChatUseCase`, which removes the attachments first). A method correct only after another
  one ran is a trap: guard the invariant inside it, or take a proof value only the check builds
  (`ChatService.findSendable` → `SendableChat` → `MessageService.addUserMessage`).

## When a flow becomes a use case

Move it to `<verb>-<object>.use-case.ts` as soon as one holds: it composes two domain services or
sends a job; it needs one transaction or one ordering of writes across them; keeping it in a
service needs an exception to a rule here. Do not wait for the method to grow: the exception is
the signal.

## Use cases

- A use case is a `Context.Service` whose `layer` provides the domain services it composes and
  leaves the ports open, so the process provides the adapters and a unit test the memory layers.
- **It writes through domain services, save a rule-free write:** one `set` and one `where` whose
  only refusal is "the row is gone" may be its own repository call (the chat's `updatedAt` at a
  send and at a settle). A precondition, a transition, a second field or a domain error beyond
  not-found makes it a service method. A read with no rule (a job's message by id) may go to the
  port too.
- **All checks precede every write;** a step's own guard may repeat a check the use case made.
- **The writes commit in one transaction:** `Transaction.run` (`@app-template/infrastructure/db`)
  as a pipeable of the `Effect.fn` that holds them; the process provides `Transaction.layer`, a
  unit test `TransactionTest`. `AttachmentBucket` stays outside it: keep the bytes before the row
  that binds them, and delete them before the commit.
- **Enqueue inside the transaction of the writes the job reads**, through `QueueClient.send`
  ([database.md › The outbox](../../docs/knowledge/database.md#the-outbox)).
- Read a set through the port's batch method (`selectMany`), never one `select` per id in a loop.
- Return the contract's shape (each message with its attachments), so the handler only projects
  each model onto its DTO's fields (`Struct.pick`) and composes nothing.

## Handlers

- A handler decodes the input, calls one domain service method or one use case, and shapes the
  outcome; it holds no rule and never calls a step a use case owns.
- A worker handler owns the queue's policy, the last attempt and the dead letter: it composes the
  use case's methods (`generate`, then `fail` on the last attempt's cause), which never see
  `AttemptInfo`.

## Concurrency

- **Hold no lock in the process.** A rule two writers could break between a read and a write is
  a database guard in the write itself (a partial unique index, an `UPDATE … WHERE` on the free
  state), and the domain service turns its answer into the domain error: the reply's insert
  answers `false` (`ChatBusyError`), the bind skips a taken id (`AttachmentBoundError`).
- **Write only the fields you own of a record another process also writes,** and hold a rule in
  the write's `where`, not in a read before it: the send sets the chat's `updatedAt` alone, and the
  title is written only `where` the chat is still untitled.

## Tests

- A use case's unit test checks the order of its steps and the jobs it sends, not the rules; its
  atomicity is an e2e test where the database refuses one write of the flow (a constraint the
  test adds) and no row and no outbox row is kept.
- A race runs the rival calls with `Effect.all(…, { concurrency: 'unbounded' })` on the real
  repositories and asserts an outcome that holds whichever call wins; a probe that removes the
  guard must turn it red.
