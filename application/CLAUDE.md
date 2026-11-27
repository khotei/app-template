# application

The behaviour ring: the modules and, once one exists, the use cases over them. What each layer
of a module holds: [architecture.md › The three rings](../docs/knowledge/architecture.md#the-three-rings);
what it may import: [› Dependency rules](../docs/knowledge/architecture.md#dependency-rules).

- **No I/O and no ambient state outside a module's `infrastructure/`:** no `Bun.env`, and
  `make typecheck` refuses the clock, `crypto.randomUUID()`, `fetch` and `process.env` anywhere
  in the ring. A pure operation reads no clock: a time or an id it decides by is an argument,
  and a record's new id and times are the defaults of its model's insert and update variants
  (`.claude/rules/models.md`). An adapter in `infrastructure/` does the
  I/O, over the clients the process provides (`HttpClient`) and the settings of
  `@app-template/kernel/config`, never `Bun.env`.
- **A module's `domain/` is pure:** it imports `effect`, another module's contract and
  `@app-template/packages/schema` (the id schema), and no other workspace, Bun API or Node
  built-in. It never imports the kernel: a value its table declares too (a limit, an enum's
  values) the model declares again. Ports live only in `.port.ts` files and domain services only
  in `services/`, never beside a model.
  Decision: [A module's layers](../docs/knowledge/decisions.md#a-modules-layers).
- **An infrastructure service a test stands in for, a leaf (a port's adapter, a client-backed
  service), has one fake** in its module's test support, for every workspace's unit tests; a
  service built over a leaf runs real over the leaf's fake:
  [tooling.md › Tests](../docs/knowledge/tooling.md#tests).
- **A module's `infrastructure/` holds what connects to the environment**
  ([decision](../docs/knowledge/decisions.md#a-modules-layers)). An adapter of a port, or a
  service its module calls there, keeps its client and prompts inside, so callers never see them.
- A `<model>.queue.ts` in `infrastructure/` holds the module's queue definitions and its
  `<Model>Queue`, which holds each job's `send<Job>` and each event's `send<Event>`; no adapter
  wraps the worker.
- **`http-api/` is the API contract,** which the api implements. A group takes the domain's schemas
  as they are (ids, checks, models, errors), through the modules' contracts alone: an error's status
  is on its class (`{ httpApiStatus: 404 }`, the third argument of `Schema.TaggedError`), an
  endpoint or a middleware lists the bare class, and a model goes on the wire only as its
  `<Model>.json`, never the class, so what the model keeps off the wire (a sensitive or select-only
  field) stays off, with `.mapFields(…)` where the wire adds or swaps a field, named by an
  `identifier` (`Api<Model>`). Decision:
  [The API contract in the api](../docs/knowledge/decisions.md#the-api-contract-in-the-api).
