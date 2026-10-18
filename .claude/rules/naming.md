---
paths:
  - "**/*.ts"
  - "**/package.json"
---

# Naming and imports

Imports are enforced by Biome; file and symbol names are convention (Biome has no rule for them).

## Workspaces

- Every workspace is `@app-template/<name>`: layers
  `@app-template/{domain,application,infrastructure}`, packages `@app-template/<dir>`
  (`@app-template/config`), apps `@app-template/{api,worker,web}`, `@app-template/deployment`.
- A layer exposes each entity as a subpath through its barrel: `@app-template/domain/chat` →
  `domain/chat/index.ts`. A package exposes one entry (`index.ts`, or `client.ts` for clients).
- App entrypoint: `src/main.ts`.

## Imports

- **Inside a workspace:** `#<workspace>/<path>` (declared in its `package.json` `imports`), never
  `./` or `../`. Example: `#domain/chat/chat.model`, `#api/http`.
- **Across workspaces:** `@app-template/<workspace>[/<entity>]`, only downward:
  `apps` → `application` → `infrastructure` → `domain`; `packages/*` serve every layer except
  `domain`. The full matrix lives in
  [docs/knowledge/architecture.md](../../docs/knowledge/architecture.md).
- **Order:** `bun:`/`node:` → external packages → `@app-template/*` → `#…`, one blank line
  between groups. `make fmt` sorts and groups them.

## Files

All source files are `kebab-case` with at most one dotted role suffix, `<entity>.<role>.ts`:

| Suffix | Role | Layer |
|---|---|---|
| `.id` | the aggregate's branded ids, the only file other aggregates' models import | domain |
| `.model` | entity types and value shapes | domain |
| `.error` | domain errors | domain |
| `.service` | domain: ports + pure operations · application: a service over ports | domain, application |
| `.use-case` | a flow that composes services | application |
| `.job` | a queue's producer service and its worker | application |
| `.repository` · `.storage` · `.llm` | an adapter over a client | infrastructure |
| `.queue` | queue definitions | infrastructure |
| `.client` | client wiring | infrastructure/shared, packages |
| `.handler` | a request handler | apps |
| `.test` | a colocated test that mirrors its source name | any |

A file with none of these roles keeps a bare kebab name (`http.ts`, `main.ts`).

## Symbols

- Types are `PascalCase` `<Entity><Role>`: `ChatRepository`, `ChatService`.
- Errors are `<Entity><Problem>Error`.
- Functions are verb-first, and the verb marks the kind of work:
  - `create<Thing>`: a factory that wires dependencies (`createCollection`);
  - `layer<Variant>`: a static that builds the service's `Layer` for one variant, a function when
    it takes options (`QueueClient.layerSqlite`), after effect's `SqliteClient.layer`; a
    combinator that returns a `Layer` is named for what it runs (`worker`, as effect's
    `DurableQueue.worker`);
  - `build` / `ensure`: a pure function that derives a value or guards an invariant, in any layer
    (`buildChat`);
  - a pure transition is named for the stage it moves the entity to (`prepareMessage`);
  - `is`: a predicate (`isActiveMessage`);
  - `select` / `insert` / `update` / `upsert` / `delete`: persistence (`selectById`); `update`
    changes an existing record and never creates one.
- Constants are `camelCase` with `as const` for literals. A `Layer` constant for a service
  declared elsewhere is `PascalCase` `<Service><Variant>` (`ChatRepositoryKv`).
