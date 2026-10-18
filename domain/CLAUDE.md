# domain

The pure core. It owns entity models, errors, ports (the interfaces that infrastructure implements)
and pure operations.

- **Imports no workspace at all**, not even `packages/*`. Biome rejects any `@app-template/*`
  import.
- **No I/O and no ambient state:** no `Bun.env`, no `fetch`, no `Date.now()`, no `new Date()`, no
  `crypto.randomUUID()`. Pass time and ids in as input (`buildChat({ id, userId, createdAt })`),
  so operations stay deterministic and testable.
- Models are `Schema.Class`; ids are `Schema` values `<Entity>Id`, branded `'<Entity>Id'`, with a
  type of the same name.
- Errors are `Schema.TaggedError` classes whose `_tag` is the class name, and carry no HTTP status.
- Persistence ports are `Context.Service` declarations with no layer, in `<entity>.service.ts`
  next to the operations; their layers live in `infrastructure`.
- Each entity folder exposes itself through `index.ts` (`@app-template/domain/<entity>`).
