# application

The behaviour ring: the modules and the use cases over them. What each layer of a module holds:
[architecture.md › The three rings](../docs/knowledge/architecture.md#the-three-rings); what it
may import: [› Dependency rules](../docs/knowledge/architecture.md#dependency-rules).

- **No I/O and no ambient state outside a module's `infrastructure/`:** no `Bun.env`, no `fetch`,
  no `Date.now()`, no `new Date()`, no `crypto.randomUUID()`. A pure operation takes time and ids
  as input. An adapter in `infrastructure/` does the I/O, over the clients the process provides
  (`HttpClient`) and the settings of `@app-template/kernel/config`, never `fetch` or `Bun.env`.
- **A module's `domain/` ships to the browser** through `http-api`: no Bun APIs and no Node
  built-ins, and no top-level side effects, since `"sideEffects": false` lets the bundler drop
  every module the client does not use. Ports live only in `.port.ts` files and services only in
  `services/`, never beside a model, so `make bundle-check` can prove neither reaches the
  bundle.
- **Each port has one memory layer** in its module's test support, for every workspace's unit
  tests: [tooling.md › Tests](../docs/knowledge/tooling.md#tests).
- **An adapter is a `Layer` of a port** in the module's `infrastructure/`, so callers never see
  the client: the prompts stay inside the adapter.
- A `<model>.queue.ts` in `services/` holds only queue definitions; no adapter wraps `send` or
  `worker`.
