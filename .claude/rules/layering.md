---
paths:
  - "application/**"
  - "apps/**"
---

# Layering: models, domain services, use cases, handlers

Words: [glossary.md › Architecture language](../../docs/knowledge/glossary.md#architecture-language).

## Ports and domain services

- A model imports of another aggregate only its `.id` file, save a model it holds as a field it
  never writes; a port may `import type` another aggregate's model.
- A port speaks the domain's words, never a client's type or error; which failures it declares:
  [effect-schema.md › Failures](effect-schema.md#failures).
- No port in front of a repository: a service calls the data layer's `<Name>Repository` in
  entities and maps them with its module's `<Model>FromEntity`.
- A domain service owns its model's records for every caller above it: the reads a rule needs and
  the plain reads and writes a handler asks for (a list, a create, a record by key with its
  `*NotFoundError`). It sees the repositories, its ports, the clock and `Crypto`, and the
  services of its own model it is layered over; never another model's service, the queue or the
  transaction, which are a use case's.
- A model needs a second read that applies a rule → `Live<Model>Service` over the plain
  `<Model>Service`; one that stores bytes → `File<Model>Service` over the live one. Record:
  [Layered services of one model](../../docs/knowledge/decisions.md#layered-services-of-one-model).
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
- Send a job after the commit of the writes it reads, so a delivery always finds its record. A
  send SQS refuses (`QueueError`) fails the work the caller waits on, in a transaction of its
  own, and the use case answers that failure; a refused send of other work is logged
  ([decisions.md › Jobs as queue messages](../../docs/knowledge/decisions.md#jobs-as-queue-messages)).
- A job runs once, unretried: a use case a job runs ends its own work on any outcome but
  success, an interrupt included, and work it finds started was left by a run that died.
- Read or delete a set through one batch call, never one call per id.
- Return a model as is.

## Handlers

- A handler decodes the input, calls one domain service method or one use case, returns a model
  through its `buildApi<Model>` and fails with the domain's errors as they are. It holds no rule
  and imports no repository, `<Model>FromEntity` or data layer: only the process's `layer.ts`
  provides them.

## Concurrency

Hold no lock in the process: a rule two writers could break is a guard in the write itself, which
dies when refused, and a write sets only the fields its writer owns:
[database.md › Guards](../../docs/knowledge/database.md#guards).
