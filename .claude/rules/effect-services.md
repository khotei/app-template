---
paths:
  - "**/*.ts"
---

# Effect: functions, services and layers

## Functions

- An effectful function at a tracing boundary is `Effect.fn('<name>')(function* (…) { … })`, named
  after its export, a service method `'<Service>.<method>'`; a helper that marks no useful
  boundary is `Effect.fnUntraced`. Extra arguments to `Effect.fn` are the pipeables every call
  runs through (`transaction.run`); a body that only delegates is passed as is
  (`Effect.fn('<Service>.<method>')(port.<method>)`).
- The variable holding it is named after the span's last segment, a reserved word its plain
  synonym (`remove` for `'<Model>Service.delete'`), never with a model suffix. A method that needs
  the model in its name is often doing a neighbouring service's work.
- A module-level function another module composes states `Effect.fn.Return<A, E, R>` on the
  generator; a helper used once stays inferred.
- A pure builder that cannot fail returns the model, not an `Effect`.
- A pure transition (`naming.md`) checks its source in one shared table of allowed sources and
  fails one `<Model>StatusInvalidError { id, from, to }`. One whose refusal reaches the user maps
  it to its own (`<Model>BusyError`), so the contract names the refusal and the table holds the
  rule.

## Services

- A `Context.Service` only when something varies (the implementation, a test double, an injected
  dependency) or several holders share one state; otherwise a plain function.
- Its key is `'@app-template/<folder>/<Name>'`, `<folder>` its file's folder from the repository
  root, so the key says where to look.
- One built in a body beside its declaration is `Context.Service<Self, Shape>()(key, { make })`:
  the explicit `Shape` keeps the contract and its docs. A one-expression build (`Config.all`) goes
  straight into `Layer.effect`.

## Layers

- A service's layers are statics on the class. `static readonly layer = Layer.effect(this,
  this.make)` provides each dependency that has one implementation and leaves open the leaves
  that vary (a port, a client, a platform service); a domain service's leaves every dependency
  open but the services of its model it is layered over (`layering.md`). There is no
  `layerNoDeps`. A variant that closes a leaf is `static layer<Variant>`, a function when it
  takes options; a layer for a service declared elsewhere (a domain port) is a constant in the
  workspace that implements it (`naming.md`).
- Variants live in the service's file: a separate file would import the class while the class
  referenced it, a cycle.
- Chain `Layer.provide` from the nearest dependency outward; `Layer.provide([a, b])` only for
  siblings that cannot feed each other. `Layer.provideMerge` publishes internals: only for the
  client a caller opens transactions on (`DbTest`) and a test layer that merges what its cases
  read.
- A client takes its settings as options and never reads `Config` (`PgClient.layerConfig` is
  rejected): [tooling.md › Environment](../../docs/knowledge/tooling.md#environment).
- A combinator that returns a `Layer` runs its effect in a fiber the layer's scope owns:
  `Effect.forkScoped`, then `Layer.effectDiscard`.
