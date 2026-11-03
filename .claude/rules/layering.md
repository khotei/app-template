---
paths:
  - "application/**"
  - "apps/**"
---

# Layering: models, domain services, use cases, handlers

Words: `docs/knowledge/glossary.md › Architecture language`.

## Ports and domain services

- A model imports of another aggregate only its `.id` file, save a model it holds as a field it
  never writes; a port may `import type` another aggregate's model.
- A port speaks the domain's words, never a client's type or error; which failures it declares:
  [effect-schema.md › Failures](effect-schema.md#failures).
- No port in front of a repository: a service calls the data layer's `<Name>Repository` in
  entities and maps them with its module's `<Model>FromEntity`.
- A domain service owns its model's records for every caller above it: the reads a rule needs and
  the plain reads and writes a handler asks for (a list, a create, a record by key with its
  `*NotFoundError`). It sees the repositories, its ports, the clock and `Crypto`; never another
  domain service, the queue or the transaction, which are a use case's.
- A rule is a pure function in its model's `.model` file, over values passed in (time, ids),
  combined from small pieces of one condition or step each, never repeating their logic; a
  service, use case or repository only reads, calls it and writes
  (`getOne(where).pipe(ensure<Rule>(at))`). Each piece is tested alone, a combination only for
  what it adds.
- Every method is safe on its own: guard the invariant inside it, never rely on another method
  having run first.

## Use cases

- A flow becomes a use case as soon as it composes two domain services or sends a job, needs one
  transaction or one ordering of writes across them, or needs an exception to a rule here.
- A `Context.Service` whose `layer` provides the domain services it composes and leaves the
  repositories and ports open, for the process or a unit test's memory layers.
- It writes through a domain service where one holds the write's rule, else through the
  repository: a rule-free write, or one whose rule a model function already ran (a status move);
  a read with no rule may go to the repository too. A rule of its own is refused (`modules.md`).
- All checks precede every write; a step's own guard may repeat a check the use case made.
- The writes commit in one transaction, `Transaction`'s `run` piped on the `Effect.fn` that holds
  them. An object store joins none: keep the bytes before the row that binds them, delete them
  once the rows are gone.
- Enqueue inside the transaction of the writes the job reads, through `QueueSender.send`
  ([database.md › The outbox](../../docs/knowledge/database.md#the-outbox)).
- Read or delete a set through one batch call, never one call per id.
- Return the contract's shape, a model as is: its DTO's encoder drops the fields it leaves out.

## Handlers

- A handler decodes the input, calls one domain service method or one use case, and shapes the
  outcome. It holds no rule and imports no repository, mapper or data layer: only the process's
  `layer.ts` provides them.
- A worker handler owns the queue's policy, the last attempt and the dead letter: it composes the
  use case's work, then its failure on the last attempt's cause; the use case never sees the
  attempt.

## Concurrency

Hold no lock in the process: a rule two writers could break is a guard in the write itself, which
dies when refused, and a write sets only the fields its writer owns:
[database.md › Guards](../../docs/knowledge/database.md#guards).
