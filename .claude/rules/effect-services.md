---
paths:
  - "**/*.ts"
---

# Effect: functions, services and layers

## Functions

- An effectful function at a tracing boundary is `Effect.fn('<name>')(function* (…) { … })`,
  named after its export; a service method is named `'<Service>.<method>'`. An internal helper
  that marks no useful tracing boundary is `Effect.fnUntraced`.
- A body that only delegates is passed as is, `Effect.fn('<Service>.<method>')(collection.get)`,
  or as an arrow returning the effect; a generator is for a body with more than one step. Extra
  arguments to `Effect.fn` are the pipeables every call runs through (`lock.withPermit`).
- The variable holding an `Effect.fn` is named after the span's last segment; a reserved word
  gets its plain synonym (`remove` for `'ChatService.delete'`), never an entity suffix, since
  `'<Service>.<method>'` already names the entity. A method that needs the entity in its name
  is often doing a neighbouring service's work: look there before accepting the name.
- A module-level function that a handler, a job's `handle` or an export composes states its
  `Effect.fn.Return<A, E, R>` on the generator (`suggestChatTitle`), so the contract is read in
  one line; a helper used once stays inferred, since the annotation drifts on refactors.
- A pure builder that cannot fail returns the model itself, not an `Effect`.
- A pure transition (`naming.md`) checks its source through one shared table of allowed sources and
  fails one `<Entity>StageInvalidError { id, from, to }`; a transition is one row and one call.

## Services

- Add a `Context.Service` only when something varies (the implementation: memory, file,
  Postgres; a test double; an injected dependency) or when several holders must share one state
  (a lock). A rule with one implementation and no dependency is a plain function.
- Key a service `'@app-template/<workspace>/<entity>/<Name>'`.
- A service built in a body beside its declaration is
  `Context.Service<Self, Shape>()(key, { make })`: the explicit `Shape` keeps the contract and its
  docs, `make` the body. A one-expression build (`Config.all`) goes straight into `Layer.effect`.
- A port's doc comment states the contract the type cannot (order of a list, what a missing key
  yields); the adapter repeats none of it.

## Layers

- A service's layers are statics on the class, as in effect's own modules (`SqliteClient.layer`,
  `KeyValueStore.layerMemory`). `static readonly layer = Layer.effect(this, this.make)` provides
  every dependency with one implementation and leaves open the leaves that vary (a port, a client,
  a store, a platform service); there is no `layerNoDeps`. A ready variant that closes such a leaf
  is `static layer<Variant>`, a function when it takes options (`QueueTransport.layerSqs`,
  `KeyValueStore.layerFileSystem(directory)`). A layer for a service declared elsewhere (a domain
  port, effect's `KeyValueStore`) is a constant in the workspace that implements it (`naming.md`).
- Variants live in the service's file: a separate file would import the class while the class
  referenced it, a cycle.
- Chain `Layer.provide` from the nearest dependency outward. `Layer.provide([a, b])` provides
  siblings that cannot feed each other. Never publish internals with `Layer.provideMerge`; the
  exception is the client a caller opens transactions on (`Db.layerFromConfig`, `DbTest`).
- A client never reads the environment (`SqliteClient.layerConfig` is rejected): `Config` turns
  into options in `infrastructure`, and only `@app-template/config` reads variables.
- A combinator that returns a `Layer` runs its effect in a fiber the layer's scope owns:
  `Effect.forkScoped` then `Layer.effectDiscard`, so closing the scope stops the work.
