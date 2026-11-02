---
paths:
  - "application/**"
  - "apps/**"
---

# Layering: ports, domain services, use cases, handlers

Where a flow lives. Words: `docs/knowledge/glossary.md › Architecture language`.

## Ports and domain services

- **A port speaks the domain's words,** never a client's type or error; which failures it
  declares: [effect-schema.md › Failures](effect-schema.md#failures).
- **A repository is the data layer's, with no port in front:** a service calls
  `<Name>Repository` from `@app-template/kernel/data` in entities and maps them with the
  `<Model>FromEntity` of its module's `services/`.
- **A domain service owns its model's records for every caller above it:** the reads a rule
  needs (the stored rows a check runs over) and the plain reads and writes a handler asks for (a
  list, a create, a record by key with its `*NotFoundError`).
- **A rule is a pure function in its model's `.model` file,** over values passed in (time, ids),
  combined from small pieces of one condition or step each (`Predicate.and`, a pipeable guard,
  `flow`) and never repeating their logic. A service, use case or repository only reads, calls it
  and writes; each piece is tested alone, a combination or a service only for what it adds.
```ts
// don't: the rule is inline in the service, so only a layer over a fake tests it
const order = yield* getOne(where)
if (Option.isNone(order.paidAt) || DateTime.isGreaterThan(at, order.refundUntil))
  return yield* new OrderNotRefundableError({ id: order.id })

// do: small pure pieces in the model, each tested alone with plain values…
export const isPaid: Predicate.Predicate<Order> = (order) => Option.isSome(order.paidAt)
export const isRefundOpenAt = (at: DateTime.Utc): Predicate.Predicate<Order> => (order) =>
  DateTime.isLessThanOrEqualTo(at, order.refundUntil)
// …combined into larger ones, whose test covers only the combination…
export const isRefundableAt = (at: DateTime.Utc) => Predicate.and(isPaid, isRefundOpenAt(at))
export const isCancellableAt = (at: DateTime.Utc) =>
  Predicate.and(Predicate.not(isPaid), isRefundOpenAt(at))
export const ensureRefundable = (at: DateTime.Utc) =>
  Effect.filterOrFail<Order, OrderNotRefundableError>(isRefundableAt(at), (order) =>
    new OrderNotRefundableError({ id: order.id }))
// …and the service only reads and composes them
const order = yield* getOne(where).pipe(ensureRefundable(at))
```
- It sees the repositories, its ports, the clock (`DateTime.now`) and `Crypto`; never another
  domain service, the queue or the transaction, which are a use case's.
- **Every method is safe on its own:** a method correct only after another one ran is a trap;
  guard the invariant inside it.

## When a flow becomes a use case

Move it to `<verb>-<object>.use-case.ts` as soon as one holds: it composes two domain services or
sends a job; it needs one transaction or one ordering of writes across them; keeping it in a
service needs an exception to a rule here. Do not wait for the method to grow: the exception is
the signal.

## Use cases

- A use case is a `Context.Service` whose `layer` provides the domain services it composes and
  leaves the repositories and ports open, so the process provides their layers and a unit test
  the memory layers.
- **It writes through a domain service where one holds the write's rule,** else through the
  repository: a rule-free write, or one whose rule a model function already ran (a status
  move). A read with no rule (a job's record by id) may go to the repository too.
- **All checks precede every write;** a step's own guard may repeat a check the use case made.
- **The writes commit in one transaction:** `Transaction`'s `run` as a pipeable of the `Effect.fn`
  that holds them; the process provides its layer, a unit test the identity one. An object
  store's repository joins none: keep the bytes before the row that binds them, delete them once
  the rows are gone.
- **Enqueue inside the transaction of the writes the job reads**, through `QueueSender.send`
  ([database.md › The outbox](../../docs/knowledge/database.md#the-outbox)).
- Read or delete a set through one batch call, never one call per id in a loop.
- Return the contract's shape, so the handler composes nothing: it returns a model as is, since
  its DTO's encoder drops every field the DTO leaves out.

## Handlers

- A handler decodes the input, calls one domain service method or one use case, and shapes the
  outcome; it never reads or writes a repository and holds no rule.
- A worker handler owns the queue's policy, the last attempt and the dead letter: it composes the
  use case's methods (the work, then its failure on the last attempt's cause), which never see the
  attempt.

## Concurrency

- **Hold no lock in the process.** A rule two writers could break between a read and a write is
  a database guard in the write itself (a partial unique index, an `UPDATE … WHERE` on the
  state read), and a refused write dies. No read takes a lock: a loser that read the state
  before the winner wrote it dies on the write's guard, rolled back whole.
- **Write only the fields you own of a record another process also writes,** and hold a rule in
  the write's `where`, not in a read before it: a background job fills a field only `where` it is
  still empty.
