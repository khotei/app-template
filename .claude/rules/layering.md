---
paths:
  - "domain/**"
  - "application/**"
  - "apps/**"
---

# Layering: ports, domain services, use cases, handlers

Where a flow lives. Words: `docs/knowledge/glossary.md › Architecture language`.

## Ports and domain services

- **A port speaks the domain's words,** never a client's type or error; its adapter turns a
  failure into a defect (`effect-schema.md`).
- **A domain service holds the rules that need a port:** a check over stored rows, a refusal
  named after a read; a bare not-found stays in the handler that reads it; an entity whose rules
  are all pure model functions has none.
- It sees its ports, the clock (`DateTime.now`) and `Crypto`; never another domain service, the
  queue or the transaction, which are a use case's.
- **Every method is safe on its own:** a method correct only after another one ran is a trap;
  guard the invariant inside it.

## When a flow becomes a use case

Move it to `<verb>-<object>.use-case.ts` as soon as one holds: it composes two domain services or
sends a job; it needs one transaction or one ordering of writes across them; keeping it in a
service needs an exception to a rule here. Do not wait for the method to grow: the exception is
the signal.

## Use cases

- A use case is a `Context.Service` whose `layer` provides the domain services it composes and
  leaves the ports open, so the process provides the adapters and a unit test the memory layers.
- **It writes through a domain service where one holds the write's rule,** else through the
  port: a rule-free write, or one whose rule a model function already ran (a status move). A read
  with no rule (a job's record by id) may go to the port too.
- **All checks precede every write;** a step's own guard may repeat a check the use case made.
- **The writes commit in one transaction:** `Transaction`'s `run` as a pipeable of the `Effect.fn`
  that holds them; the process provides its layer, a unit test the identity one. An object store
  stays outside it: keep the bytes before the row that binds them, delete them before the commit.
- **Enqueue inside the transaction of the writes the job reads**, through `QueueSender.send`
  ([database.md › The outbox](../../docs/knowledge/database.md#the-outbox)).
- Read or delete a set through one batch call, never one call per id in a loop.
- Return the contract's shape, so the handler composes nothing: it returns a model as is, since
  its DTO's encoder drops every field the DTO leaves out.

## Handlers

- A handler decodes the input, calls one domain service method, one use case or, for a step no
  rule guards (a list, a record a model function builds, a read whose none is the domain's
  `*NotFoundError`), the port, and shapes the outcome; it holds no other rule.
- A worker handler owns the queue's policy, the last attempt and the dead letter: it composes the
  use case's methods (the work, then its failure on the last attempt's cause), which never see the
  attempt.

## Concurrency

- **Hold no lock in the process.** A rule two writers could break between a read and a write is
  a database guard in the write itself (a partial unique index, an `UPDATE … WHERE` on the
  state read), and a refused write dies. A check whose loser must get a domain error reads its
  rows `forUpdate`.
- **Write only the fields you own of a record another process also writes,** and hold a rule in
  the write's `where`, not in a read before it: a background job fills a field only `where` it is
  still empty.
