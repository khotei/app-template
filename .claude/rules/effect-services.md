---
paths:
  - "**/*.ts"
---

# Effect: functions, services and layers

## Functions

- An effectful function follows `repos/effect/LLMS.md › Using Effect.fn and Effect.fnUntraced`. A
  service method's span is `'<Service>.<method>'`; what applies to the whole method is
  `Effect.fn`'s extra arguments, never a `.pipe` around its body, while a step inside keeps its
  own tail (`effect-style.md › Errors and logs`); one that reads the method's arguments takes
  them after the effect; a body that only delegates is passed as is
  (`Effect.fn('<Service>.<method>')(port.<method>)`). An `Effect.fnUntraced` body is a generator.
```diff
- const getOne = Effect.fn('OrderService.getOne')((where: OrderWhere) =>
-   orders.selectOne(encodeWhere(where)).pipe(               // a pipe nested in the body
-     Effect.flatMap(decodeWith(Schema.Option(Order))),
-     Effect.flatMap(Effect.fromOption(() => new OrderNotFoundError({ id: where.id }))),
-   ),
- )
+ const getOne = Effect.fn('OrderService.getOne')(
+   (where: OrderWhere) => orders.selectOne(encodeWhere(where)),
+   Effect.flatMap(decodeWith(Schema.Option(Order))),
+   (found, where) =>
+     Effect.flatMap(found, Effect.fromOption(() => new OrderNotFoundError({ id: where.id }))),
+ )
```
- The variable holding it is named after the span's last segment, a reserved word its plain
  synonym (`remove` for `'<Model>Service.delete'`), never with a model suffix. A method that needs
  the model in its name is often doing a neighbouring service's work.
- A module-level function another module composes states `Effect.fn.Return<A, E, R>` on the
  generator; a helper used once, a composed function whose every caller dies on its errors
  (`Effect.orDie`), or a use case, whose endpoint's error list or `consumeQueue`'s `never` checks
  it, stays inferred.
- A pure builder that cannot fail returns the model, not an `Effect`.

## Services

- A `Context.Service` is one of four kinds; anything else is a plain function or constant:
  - one a test or a second implementation stands in for: a port, a repository, `Transaction`,
    the queue's sender;
  - a client its layer builds once for every holder: the database, a bucket, the API client;
  - a value a middleware provides to the handlers behind it (`HttpApiMiddleware`'s `provides`);
  - a domain service ([layering.md](layering.md)); a use case and a job's `send<Job>` are functions.
- No port in front of one implementation: a service over a client (a language model, a store)
  is its own class with its layer, and a test provides a layer of that class; a port comes with
  the second implementation ([decision](../../docs/knowledge/decisions.md#a-modules-layers)).
- Its key is `'@app-template/<folder>/<Name>'`, `<folder>` its file's folder from the repository
  root, so the key says where to look.
- One built in a body beside its declaration is `Context.Service<Self, Shape>()(key, { make })`:
  the explicit `Shape` keeps the contract and its docs. A one-expression build
  (`<Client>.useSync(…)`) goes straight into `Layer.effect`.

## Layers

- A service's layers are statics on the class. `static readonly layer = Layer.effect(this,
  this.make)` provides each dependency that has one implementation and leaves open the leaves
  that vary (a port, a client, a platform service); a domain service's leaves every dependency
  open, the services it is composed over included, so the one the process provides, or its wrap,
  reaches every holder (`composition.md`). There is no `layerNoDeps`. A variant that closes a
  leaf, or wraps the service, is `static layer<Variant>`, a function when it takes options; a layer
  for a service declared elsewhere (a domain port) is a constant in the workspace that implements
  it (`naming.md`).
- Variants live in the service's file: a separate file would import the class while the class
  referenced it, a cycle.
- Chain `Layer.provide` from the nearest dependency outward; `Layer.provide([a, b])` only for
  siblings that cannot feed each other. `Layer.provideMerge` publishes internals: only for the
  client a caller opens transactions on (`DbTest`) and a test layer that merges what its cases
  read.
- A client of ours takes its settings as options and never reads `Config`; the kernel hands a
  library's client its settings, through the library's own `layerConfig` where it has one:
  [tooling.md › Environment](../../docs/knowledge/tooling.md#environment).
