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
- **A domain service holds the rules that need a port:** a check over stored rows, a refusal
  named after a read (`ChatService`); a bare not-found stays in the handler that reads it. An
  entity whose rules are all pure model functions has no service: a use case runs the function
  and writes the result through the port (the messages: `prepareMessage`, then `MessageRepository.update`).
- It sees its ports, the clock (`DateTime.now`) and `Crypto`; never another domain service, the
  queue or `Transaction`, which are a use case's.
- **Every method is safe on its own,** except a step a use case owns (a cascade): its doc comment
  names the use case, and handlers call only that. A method correct only after another one ran
  is a trap: guard the invariant inside it, or take a proof value only the check builds.

## When a flow becomes a use case

Move it to `<verb>-<object>.use-case.ts` as soon as one holds: it composes two domain services or
sends a job; it needs one transaction or one ordering of writes across them; keeping it in a
service needs an exception to a rule here. Do not wait for the method to grow: the exception is
the signal.

## Use cases

- A use case is a `Context.Service` whose `layer` provides the domain services it composes and
  leaves the ports open, so the process provides the adapters and a unit test the memory layers.
- **It writes through a domain service where one holds the write's rule,** else through the
  port: a rule-free write and a write whose rule a model function already ran (a message's status
  move, a chat's status move). A read with no rule (a job's
  message by id) may go to the port too.
- **All checks precede every write;** a step's own guard may repeat a check the use case made.
- **The writes commit in one transaction:** the `Transaction` service's `transaction.run`
  (`@app-template/infrastructure/db`) as a pipeable of the `Effect.fn` that holds them; the
  process provides `Transaction.layer`, a unit test `TransactionTest`. `AttachmentBucket` stays
  outside it: keep the bytes before the row that binds them, and delete them before the commit.
- **Enqueue inside the transaction of the writes the job reads**, through `QueueClient.send`
  ([database.md › The outbox](../../docs/knowledge/database.md#the-outbox)).
- Read a set through the port's batch method (`selectMany`), never one `select` per id in a loop.
- Return the contract's shape (a message carries its attachments), so the handler composes
  nothing: it returns a model as is, since its DTO's encoder drops every field the DTO leaves
  out (a failure's `cause`).

## Handlers

- A handler decodes the input, calls one domain service method, one use case or, for a step no
  rule guards (a list, a record a model function builds, a read whose none is the domain's
  `*NotFoundError`), the port, and shapes the outcome; it holds no other rule and never calls a
  step a use case owns.
- A worker handler owns the queue's policy, the last attempt and the dead letter: it composes the
  use case's methods (`generate`, then `fail` on the last attempt's cause), which never see
  `AttemptInfo`.

## Concurrency

- **Hold no lock in the process.** A rule two writers could break between a read and a write is
  a database guard in the write itself (a partial unique index, an `UPDATE … WHERE` on the free
  state). The caller checks first, so a refused write is a lost race and the adapter dies on it
  (the reply's insert, a status move); the bind skips a taken id (`AttachmentBoundError`). A
  check whose loser must get a domain error reads its rows `forUpdate` (`AttachmentService.bind`).
- **Write only the fields you own of a record another process also writes,** and hold a rule in
  the write's `where`, not in a read before it: the send sets the chat's `status` alone, and the
  title is written only `where` the chat is still untitled.
