---
paths:
  - "**/*.ts"
  - "**/package.json"
---

# Naming and imports

Imports are enforced by Biome; file and symbol names are convention (Biome has no rule for them).

## Workspaces

- Every workspace is `@oblik/<name>`: layers `@oblik/{domain,application,infrastructure}`,
  packages `@oblik/<dir>` (`@oblik/config`), apps `@oblik/{api,worker,web}`, `@oblik/deployment`.
- A layer exposes each entity as a subpath through its barrel: `@oblik/domain/example` →
  `domain/example/index.ts`. A package exposes one entry (`index.ts`, or `client.ts` for clients).
- App entrypoint: `src/main.ts`; its composition root: `src/layer.ts`.

## Imports

- **Inside a workspace:** `#<workspace>/<path>` (declared in its `package.json` `imports`), never
  `./` or `../`. Example: `#domain/shared/id`, `#api/http`.
- **Across workspaces:** `@oblik/<workspace>[/<entity>]`, only downward:
  `apps` → `application` → `infrastructure` → `domain`; `packages/*` serve every layer except
  `domain`. The full matrix lives in
  [docs/knowledge/architecture.md](../../docs/knowledge/architecture.md).
- **Order:** `bun:`/`node:` → external packages → `@oblik/*` → `#…`, one blank line between
  groups. `make fmt` sorts and groups them.

## Files

All source files are `kebab-case` with at most one dotted role suffix, `<entity>.<role>.ts`:

| Suffix | Role | Layer |
|---|---|---|
| `.model` | entity types and value shapes | domain |
| `.error` | `DomainError` subclasses | domain |
| `.service` | domain: ports + pure operations · application: a service over ports | domain, application |
| `.use-case` | a flow that composes services | application |
| `.repository` · `.storage` · `.queue` · `.llm` | an adapter over a client | infrastructure |
| `.client` | client wiring | infrastructure/shared, packages |
| `.handler` | a job or request handler | apps |
| `.test` | a colocated test that mirrors its source name | any |

A file with none of these roles keeps a bare kebab name (`layer.ts`, `http.ts`, `load.ts`).

## Symbols

- Types are `PascalCase` `<Entity><Role>`: `ExampleRepository`, `ExampleService`, `ExampleJob`.
- Errors are `<Entity><Problem>Error`, and their `_tag` equals the class name.
- Branded ids are `Id<'<Entity>'>`, aliased `<Entity>Id`.
- Functions are verb-first, and the verb marks the kind of work:
  - `create<Thing>`: a factory that wires dependencies (`createExampleService`);
  - `build` / `ensure`: a pure function that derives a value, in any layer (`buildExample`,
    `buildObjectKey`);
  - `select` / `insert` / `upsert` / `delete`: persistence (`selectById`);
  - `load` / `read`: configuration and environment (`loadConfig`).
- Constants are `camelCase` with `as const` for literals (`exampleJobType`).
