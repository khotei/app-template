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
- A service calls the data layer's `<Name>Repository`, no port between, and codes the entities
  through the model, with `encodeWith` and `decodeWith` ([when a port](effect-services.md#services)).
- A domain service owns its model's records for every caller above it: `<Model>Service` the reads
  a rule needs and the plain reads and writes a handler asks for (a list, a create, a record by
  key with its `*NotFoundError`), coding the rows through the model. It sees the repositories,
  its ports, the clock, `SecureRandom` and `Digest`; never another model's service or the transaction,
  which are a use case's ([composition.md](composition.md)), nor its infrastructure but as below.
- A service composed over `<Model>Service` holds the job it adds and reaches the model's records
  only through it, a repository only for what it adds, so each row has one owner: a model that
  stores bytes with its records → `File<Model>Service`, holding the bytes' store; its status
  moves, each a transition written under the status read → `Move<Model>Service`; a request that
  starts jobs → `Ask<Model>Service` of the model asked, given it as read: its rules, the writes
  its jobs read, then each job's send through its module's `<model>.queue` file after their
  commit, never inside a transaction, a refused send settled on the work's record; the jobs'
  runs → `Reply<Model>Service`, each settling what ends it on its record. Only these two take
  `Transaction` and another model's service of their module, the first its queue file, the
  second its `.llm` files ([record](../../docs/knowledge/decisions.md#the-chats-jobs-in-their-services)).
- A rule is a pure function in its model's `.model` file, over values passed in (time, ids),
  combined from small pieces of one condition or step each, never repeating their logic; a
  service, use case or repository only reads, calls it and writes
  (`getOne(where).pipe(ensure<Rule>(at))`). Each piece is tested alone, a combination only for
  what it adds.
- A method applies its model's rules itself, never relying on another having run first; a plain
  write assumes nothing of its caller, which passes the state the row must still be in as `where`.

## Use cases

- A flow becomes a use case as soon as it composes the services of two models, needs one
  transaction or one ordering of writes across them, or needs an exception to a rule here.
- An `Effect.fn` that yields the domain services, ports and `Transaction` it composes; the
  process provides them after `HttpRouter.serve`, and a unit test from its mocks. Record:
  [Use cases as functions](../../docs/knowledge/decisions.md#use-cases-as-functions).
- It holds only its flow: the order of the calls, the transaction, what it skips and logs. It
  reads and writes through domain services, never a repository: a read, a write or a rule no
  service offers goes to the service or model it belongs to, and a step two use cases share lives
  once ([composition.md](composition.md)). A rule of its own is refused (`modules.md`).
- All checks precede every write; a step's own guard may repeat a check the use case made.
- The writes commit in one transaction, `Transaction`'s `run` piped on the `Effect.fn` that holds
  them. An object store joins none: keep the bytes before the row that binds them, delete them
  once the rows are gone.
- Send a job after the commit of the writes it reads, so a delivery always finds its record,
  through its `send<Job>` beside its queue's definition, which logs a refusal and returns it; the
  asked model's `Ask<Model>Service` sends it, settling a refusal on the work's record, if any
  ([decisions.md › Jobs as queue messages](../../docs/knowledge/decisions.md#jobs-as-queue-messages)).
- A job runs once, unretried: its run, the `Reply<Model>Service` method named for it, ends its
  work on any outcome but success, an interrupt included, and work it finds started, left by a
  run that died; the use case ends the job in one tail
  ([record](../../docs/knowledge/decisions.md#the-chats-jobs-in-their-services)).
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
