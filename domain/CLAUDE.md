# domain

The core: models with their pure operations, errors, ports (the contracts `infrastructure`'s
adapters implement) and the domain services that own the rules over them.

- **Imports no workspace at all**, not even `packages/*`, and no `@effect/*` package but the test
  runner. Biome holds it, save `@app-template/testing` in `domain/tests/` and `domain/testing/`,
  and `@effect/platform-bun` (for `BunCrypto.layer`) in `domain/tests/`.
- **No I/O and no ambient state:** no `Bun.env`, no `fetch`, no `Date.now()`, no `new Date()`, no
  `crypto.randomUUID()`. A pure operation takes time and ids as input
  (`buildChat({ id, userId, createdAt })`).
- Models are `Schema.Class`; ids are `Schema` values `<Entity>Id`, branded `'<Entity>Id'`, with a
  type of the same name.
- Errors are `Schema.TaggedError` classes whose `_tag` is the class name, and carry no HTTP status
  ([http-api/CLAUDE.md](../http-api/CLAUDE.md) sets it).
- **The domain ships to the browser** through `http-api`: no Bun APIs and no Node built-ins,
  and no top-level side effects, since `"sideEffects": false` lets the bundler drop every
  module the client does not use. Ports live only in `.port.ts` files and services only in
  `.service.ts` files, never beside a model, so `make bundle-check` can prove neither reaches the
  bundle. Pure operations sit in the `.model.ts` of the value they act on.
- What a domain service may write and depend on, where it gets time and ids, and when a flow
  leaves it for a use case: `.claude/rules/layering.md › Ports and domain services`.
- `testing/` holds one memory layer per port, for every workspace's unit tests; what a memory
  layer must copy from the database: `.claude/rules/effect-tests.md › Unit and e2e`.
- Each entity folder exposes itself through `index.ts` (`@app-template/domain/<entity>`).
