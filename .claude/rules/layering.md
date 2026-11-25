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
- A port speaks the domain's words, never a client's type or error ([failures](effect.md#failures)).
- A domain service owns its model's records for every caller above it: `<Model>Service` the reads
  a rule needs and the plain reads and writes a handler asks for (a list, a create, a record by
  key with its `*NotFoundError`), coding the rows through the model's codec statics
  ([models.md](models.md); no port between, [why](effect-services.md#services)). It
  sees the repositories, its ports, the clock, `SecureRandom`, `Digest` and `Transaction`; never
  another model's service or its infrastructure but as below ([composition.md](composition.md)).
- A service composed over `<Model>Service` holds the purpose it adds and reaches the model's records
  only through it, a repository only for what it adds, so each row has one owner: a model that
  stores bytes with its records → `File<Model>Service`, holding the bytes' store.
- The last grouping of a module's logic before a use case, which use cases share, is a
  `<Verb><Model>Service` ([its form](naming.md#symbols)): it composes the module's services, rules,
  `Transaction` and what one process provides, the api's its `<model>.queue` sends, the worker's
  its `.llm` files, each admitted by its file's own Biome override, and calls no use case
  ([decision](../../docs/knowledge/decisions.md#the-chats-jobs-in-their-services)).
- A status move is a pure transition, a function of the model ([its name](naming.md#symbols)): it
  checks one table of allowed moves and dies with `<Model>StatusInvalidError { id, from, to }`, as
  its callers move a record just read or moved; a refusal the user can reach is a check of its own
  before it, failing its own error (`<Model>BusyError`). A status move is written as
  `<Model>Service.update(<record>, yield* <record>.<move>(…))`, under the status the record was
  read in ([decision](../../docs/knowledge/decisions.md#a-runs-guarded-moves)).
- A rule is a pure function in its model's `.model` file, over values passed in (time, ids),
  combined from small pieces of one condition or step each, never repeating their logic; a service,
  use case or repository only reads, calls it and writes (`getOne(where).pipe(ensure<Rule>(at))`).
  Each piece is tested alone, a combination only for what it adds.
- A method applies its model's rules itself, never relying on another having run first; a plain
  write assumes nothing of its caller, which passes the state the row must still be in as `where`.

## Use cases

- A use case is what a handler calls, and only a handler: it adds what the entry needs (the
  caller's scope, a job's end and its logs) to the services it calls, and orders work over modules.
- An `Effect.fn` that yields the domain services, ports and `Transaction` it composes. Decision:
  [Use cases as functions](../../docs/knowledge/decisions.md#use-cases-as-functions).
- It holds only its flow: the order of the calls, the transaction, what it skips and logs. It
  reads and writes through domain services, never a repository: a read, a write or a rule no
  service offers goes to the service or model it belongs to, and a step two use cases share lives
  once, as a service's method; a use case holds no rule of its own and never calls another
  ([decision](../../docs/knowledge/decisions.md#use-cases-above-the-modules)).
- All checks precede every write; a step's own guard may repeat a check the use case made.
- The writes commit in one transaction, `Transaction`'s `run` piped on them or their function's last
  argument, spanning a language-model call only to store its answer, never a send. An object store
  joins none: keep the bytes before the row that binds them, delete them once the rows are gone.
- Send a job after the commit of the writes it reads, so a delivery always finds its record,
  through its `send<Job>`, which logs a refusal and returns it only where its caller settles it
  on a record ([decision](../../docs/knowledge/decisions.md#jobs-as-queue-messages)).
- A job is handled once, unretried: its handling, the worker's `<Verb><Model>Service`, ends its
  work on any outcome but success, an interrupt included, and work it finds started, left by a
  handling that died; the use case ends the job in one tail
  ([decision](../../docs/knowledge/decisions.md#the-chats-jobs-in-their-services)).
- Read or delete a set through one batch call, never one call per id; return a model as is.

## Handlers

- A handler decodes the input, calls one domain service method or one use case, returns the
  model and fails with the domain's errors as they are. It holds no rule and imports no
  repository or data layer: only the process's `layer.ts` provides them.
- An api handler is `Effect.fn('<Group>Handler.<endpoint>')`; one that calls nothing (a constant)
  is a plain function, no span; an effectful group or router builder is `Effect.fnUntraced`
  ([effect-services.md › Functions](effect-services.md#functions)).

## Concurrency

Hold no lock in the process: a rule two writers could break is a guard in the write itself, which
dies when refused, and a write sets only the fields its writer owns:
[database.md › Guards](../../docs/knowledge/database.md#guards).
