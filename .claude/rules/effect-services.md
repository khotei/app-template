---
paths:
  - "**/*.ts"
---

# Effect: functions, services and layers

## Functions

- An effectful function follows `repos/effect/LLMS.md › Using Effect.fn and Effect.fnUntraced`. A
  service method's span is `'<Service>.<method>'`; what applies to its whole result is an extra
  argument of `Effect.fn`, taking the method's arguments after the effect if it reads them, never
  a `.pipe` around or at the end of its body, where one step's plumbing is piped onto that step
  ([effect-style.md](effect-style.md#composition)); a body that only delegates is passed as is
  (`Effect.fn('<Service>.<method>')(port.<method>)`). An `Effect.fnUntraced` body is a generator.
```diff
- const getOne = Effect.fn('OrderService.getOne')((where: OrderWhere) =>
-   orders.selectOne(encodeWhere(where)).pipe(               // the whole result, piped in the body
-     Effect.flatMap(Order.decodeOne),
-     Effect.flatMap(Effect.fromOption(() => new OrderNotFoundError({ id: where.id }))),
-   ),
- )
+ const getOne = Effect.fn('OrderService.getOne')(
+   (where: OrderWhere) => orders.selectOne(encodeWhere(where)),
+   Effect.flatMap(Order.decodeOne),
+   (found, where) =>
+     Effect.flatMap(found, Effect.fromOption(() => new OrderNotFoundError({ id: where.id }))),
+ )
```
- The variable holding it is named after the span's last segment, a reserved word its plain
  synonym (`remove` for `'<Model>Service.delete'`), never with a model suffix. A method that needs
  the model in its name is often doing a neighbouring service's work.
- A module-level function another module composes states `Effect.fn.Return<A, E, R>` on the
  generator; a helper used once, a composed function whose every caller dies on its errors
  (`Effect.orDie`), or a use case, which the worker's handler checks by `consumeQueue`'s `never`,
  stays inferred.
- A pure builder that cannot fail returns the model, not an `Effect`.

## Services

- A `Context.Service` is one of four kinds; anything else is a plain function or constant:
  - one a test or a second implementation stands in for: a port, a repository, `Transaction`,
    the queue's sender;
  - a client, or a service over a leaf, its layer builds once for every holder: the database, a
    bucket, the API client, a module's `<Model>Queue`;
  - a value a middleware provides to the handlers behind it (`HttpApiMiddleware`'s `provides`);
  - a domain service ([layering.md](layering.md)); a use case is a function.
- No port in front of one implementation: a service over a client (a language model, a store)
  is its own class with its layer, and a test provides a layer of that class; a port comes with
  the second implementation ([decision](../../docs/knowledge/decisions.md#a-modules-layers)).
- Its key is `'@app-template/<folder>/<Name>'`, `<folder>` its file's folder from the repository
  root, so the key says where to look.
- One built in a body beside its declaration is `Context.Service<Self, Shape>()(key, { make })`:
  the explicit `Shape` keeps the contract and its docs. A one-expression build
  (`<Client>.useSync(…)`) goes straight into `Layer.effect`.

## Layers

- A service's layers are statics on the class. `static readonly layer` provides each dependency
  that has one implementation, the services it is composed over included, and leaves open the
  leaves that vary (a port, a client, a platform service, the transaction); a root provides only
  what its handlers and flows read, as the same layer value, given twice, builds once. A service
  composed over services builds its `layer` on `layerNoDeps`, every dependency open, which a
  process or test provides instead when it gives a wrap or a double of one of those services; one
  over leaves alone has `layer = Layer.effect(this, this.make)`, never a `layerNoDeps` equal to it.
  ```ts
  static readonly layerNoDeps = Layer.effect(this, this.make)
  static readonly layer = this.layerNoDeps.pipe(Layer.provide([OrderService.layer, StockService.layer]))
  ```
  A variant that closes a leaf, or wraps the service, is `static layer<Variant>`, a function when
  it takes options; a layer for a service declared elsewhere (a domain port) is a constant in the
  workspace that implements it (`naming.md`); a variant lives in the service's file, as a separate
  file would import the class while the class referenced it, a cycle.
- Chain `Layer.provide` from the nearest dependency outward; `Layer.provide([a, b])` only for
  siblings that cannot feed each other. `Layer.provideMerge` publishes internals: only for the
  client a caller opens transactions on (`DbTest`) and a test layer that merges what its cases
  read.
- A client of ours takes its settings as options and never reads `Config`; the kernel hands a
  library's client its settings, through the library's own `layerConfig` where it has one:
  [tooling.md › Environment](../../docs/knowledge/tooling.md#environment).
