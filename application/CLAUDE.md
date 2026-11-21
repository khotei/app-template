# application

The behaviour ring: the modules and the use cases over them. What each layer of a module holds:
[architecture.md › The three rings](../docs/knowledge/architecture.md#the-three-rings); what it
may import: [› Dependency rules](../docs/knowledge/architecture.md#dependency-rules).

- **No I/O and no ambient state outside a module's `infrastructure/`:** no `Bun.env`, and
  `make typecheck` refuses the clock, `crypto.randomUUID()`, `fetch` and `process.env` anywhere
  in the ring. A pure operation reads no clock: a time or an id it decides by is an argument,
  and a record's new id and stamps are its service's. An adapter in `infrastructure/` does the
  I/O, over the clients the process provides (`HttpClient`) and the settings of
  `@app-template/kernel/config`, never `Bun.env`.
- **A module's `domain/` is pure:** it imports `effect`, another module's contract,
  `@app-template/packages/schema` (the id schema), the data layer's values (a table's limit,
  pattern, enum values or JSON column's shape, never a table, entity or repository), no other
  workspace, no Bun API and no Node built-in. Ports live only in `.port.ts` files and domain
  services only in `services/`, never beside a model.
  Record: [A module's layers](../docs/knowledge/decisions.md#a-modules-layers).
- **Each service in a module's `infrastructure/` has one memory layer** in its module's test
  support (a port would too), for every workspace's unit tests:
  [tooling.md › Tests](../docs/knowledge/tooling.md#tests).
- **A module's `infrastructure/` holds what connects to the environment**
  ([record](../docs/knowledge/decisions.md#a-modules-layers)). An adapter of a port, or a service
  a use case or the worker's `<Verb><Model>Service` calls there, keeps its client and prompts
  inside, so callers never see them.
- A `<model>.queue.ts` in `infrastructure/` holds the module's queue definitions and each job's
  `send<Job>`, which the api's `<Verb><Model>Service` calls after the commit; no adapter wraps
  the worker.
