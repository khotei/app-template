# domain

The pure core. It owns entity models, errors, ports (the interfaces that infrastructure implements)
and pure operations.

- **Imports no workspace at all**, not even `packages/*`. Biome rejects any `@app-template/*`
  import, save `@app-template/testing` in `domain/tests/`.
- **No I/O and no ambient state:** no `Bun.env`, no `fetch`, no `Date.now()`, no `new Date()`, no
  `crypto.randomUUID()`. Pass time and ids in as input (`buildChat({ id, userId, createdAt })`),
  so operations stay deterministic and testable.
- Models are `Schema.Class`; ids are `Schema` values `<Entity>Id`, branded `'<Entity>Id'`, with a
  type of the same name.
- Errors are `Schema.TaggedError` classes whose `_tag` is the class name, and carry no HTTP status
  ([http-api/CLAUDE.md](../http-api/CLAUDE.md) sets it).
- **The domain ships to the browser** through `http-api`: no Bun APIs and no Node built-ins,
  and no top-level side effects, since `"sideEffects": false` lets the bundler drop every
  module the client does not use (the ports among them).
- Ports are `Context.Service` declarations with no layer, in `<entity>.port.ts`, never in
  `.service.ts`; their layers live in `infrastructure`. Pure operations sit in the `.model.ts`
  of the value they act on.
- Each folder (an entity, or `shared`) exposes itself through `index.ts` (`@app-template/domain/<folder>`).
