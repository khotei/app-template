# domain

The core: models with their pure operations, errors, ports (the contracts `infrastructure`'s
adapters implement) and the domain services that own the rules over them.

- **No I/O and no ambient state:** no `Bun.env`, no `fetch`, no `Date.now()`, no `new Date()`, no
  `crypto.randomUUID()`. A pure operation takes time and ids as input.
- **The domain ships to the browser** through `http-api`: no Bun APIs and no Node built-ins,
  and no top-level side effects, since `"sideEffects": false` lets the bundler drop every
  module the client does not use. Ports live only in `.port.ts` files and services only in
  `.service.ts` files, never beside a model, so `make bundle-check` can prove neither reaches the
  bundle.
- `testing/` holds one memory layer per port, for every workspace's unit tests.
