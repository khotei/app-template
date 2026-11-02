# application

The modules and the use cases over them. A module's `domain/` holds its models with their pure
operations, errors and ports; its `services/` hold the domain services that own the rules over
them and the queue definitions; its `infrastructure/` holds the adapters of its ports.

- **No I/O and no ambient state:** no `Bun.env`, no `fetch`, no `Date.now()`, no `new Date()`, no
  `crypto.randomUUID()`. A pure operation takes time and ids as input.
- **A module's `domain/` ships to the browser** through `http-api`: no Bun APIs and no Node
  built-ins, and no top-level side effects, since `"sideEffects": false` lets the bundler drop
  every module the client does not use. Ports live only in `.port.ts` files and services only in
  `services/`, never beside a model, so `make bundle-check` can prove neither reaches the
  bundle.
- Another module's ids and errors come from its contract (`@app-template/<module>-contract`), the
  one workspace a module's `domain/` imports.
- A module's `__tests__/testing/` holds one memory layer per port, for every workspace's unit
  tests.
- **An adapter is a `Layer` of a port** in the module's `infrastructure/`, so callers never see
  the client: the prompts stay inside the adapter.
- A `<entity>.queue.ts` in `services/` holds only queue definitions; no adapter wraps `send` or
  `worker`.
