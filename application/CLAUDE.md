# application

The behaviour ring: the modules and the use cases over them. What each layer of a module holds
and may import:
[architecture.md › The three rings](../docs/knowledge/architecture.md#the-three-rings).

- **No I/O and no ambient state outside a module's `infrastructure/`:** no `Bun.env`, no `fetch`,
  no `Date.now()`, no `new Date()`, no `crypto.randomUUID()`. A pure operation takes time and ids
  as input. An adapter in `infrastructure/` does the I/O, over the clients the process provides
  (`HttpClient`) and the settings of `@app-template/kernel/config`, never `fetch` or `Bun.env`.
- **A module's `domain/` ships to the browser** through `http-api`: no Bun APIs and no Node
  built-ins, and no top-level side effects, since `"sideEffects": false` lets the bundler drop
  every module the client does not use. Ports live only in `.port.ts` files and services only in
  `services/`, never beside a model, so `make bundle-check` can prove neither reaches the
  bundle.
- Another module's ids and errors come from its entry, and only the names of its `contract/`
  folder ([modules.md](../.claude/rules/modules.md)).
- A module's `__tests__/testing/` holds one memory layer per port, for every workspace's unit
  tests.
- **An adapter is a `Layer` of a port** in the module's `infrastructure/`, so callers never see
  the client: the prompts stay inside the adapter.
- A `<model>.queue.ts` in `services/` holds only queue definitions; no adapter wraps `send` or
  `worker`.
