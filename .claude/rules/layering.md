---
paths:
  - "application/**"
  - "apps/**"
---

# Layering: models, domain services, use cases, handlers

Words: [glossary.md › Architecture language](../../docs/knowledge/glossary.md#architecture-language).

## Ports and domain services

- A model imports of another aggregate only its `.util` file, save a model it holds as a field it
  never writes; a port may `import type` another aggregate's model.
- A port speaks the domain's words, never a client's type or error; which failures it declares:
  [effect-schema.md › Failures](effect-schema.md#failures).
- No port in front of a repository: a service calls the data layer's `<Name>Repository` in
  entities and codes them through the model itself, with `encodeWith` and `decodeWith`.
- A domain service owns its model's records for every caller above it: `<Model>Service` the reads
  a rule needs and the plain reads and writes a handler asks for (a list, a create, a record by
  key with its `*NotFoundError`), coding the rows through the model. It sees the repositories,
  its ports, the clock and `Crypto`; never another model's service, the queue or the transaction,
  which are a use case's ([composition.md](composition.md)).
- A service composed over `<Model>Service` holds the job it adds and reaches the model's records
  only through it, a repository only for what it adds, so each row has one owner: a model that
  stores bytes with its records → `File<Model>Service`, holding the bytes' store; its status
  moves, each a transition written under the status read → `Move<Model>Service`. Record:
  [Layered services of one model](../../docs/knowledge/decisions.md#layered-services-of-one-model).
- A rule is a pure function in its model's `.model` file, over values passed in (time, ids),
  combined from small pieces of one condition or step each, never repeating their logic; a
  service, use case or repository only reads, calls it and writes
  (`getOne(where).pipe(ensure<Rule>(at))`). Each piece is tested alone, a combination only for
  what it adds.
- Every method is safe on its own: guard the invariant inside it, never rely on another method
  having run first.

## Use cases

- A flow becomes a use case as soon as it composes the services of two models or sends a job,
  needs one transaction or one ordering of writes across them, or needs an exception to a rule
  here.
- An `Effect.fn` that yields the domain services, ports and `Transaction` it composes; the
  process provides them after `HttpRouter.serve`, and a unit test from its mocks. Record:
  [Use cases as functions](../../docs/knowledge/decisions.md#use-cases-as-functions).
- It holds only its flow: the order of the calls, the transaction, the job sends, what it skips
  and logs. It reads and writes through domain services, never a repository: a read, a write or a
  rule no service offers goes to the service or model it belongs to, and a step two use cases
  share lives once ([composition.md](composition.md)). A rule of its own is refused (`modules.md`).
- All checks precede every write; a step's own guard may repeat a check the use case made.
- The writes commit in one transaction, `Transaction`'s `run` piped on the `Effect.fn` that holds
  them. An object store joins none: keep the bytes before the row that binds them, delete them
  once the rows are gone.
- Send a job after the commit of the writes it reads, so a delivery always finds its record,
  through the job's `send<Job>` beside its queue's definition, which logs a refusal and answers
  it; the use case settles it on the work's record, by the model's transition and the service's
  update, and a job with no record only logs it
  ([decisions.md › Jobs as queue messages](../../docs/knowledge/decisions.md#jobs-as-queue-messages)).
- A job runs once, unretried: a use case a job runs ends its own work on any outcome but
  success, an interrupt included, and work it finds started was left by a run that died.
- Read or delete a set through one batch call, never one call per id.
- Return a model as is.

## Handlers

- A handler decodes the input, calls one domain service method or one use case, returns the
  model, through its `buildApi<Model>` where the wire shape adds or renames a field, and fails
  with the domain's errors as they are. It holds no rule and imports no repository or data
  layer: only the process's `layer.ts` provides them.

## Concurrency

Hold no lock in the process: a rule two writers could break is a guard in the write itself, which
dies when refused, and a write sets only the fields its writer owns:
[database.md › Guards](../../docs/knowledge/database.md#guards).
