---
paths:
  - "**/*.ts"
  - "**/package.json"
---

# Naming and imports

Imports are enforced by Biome; file and symbol names are convention (Biome has no rule for them).

## Workspaces

- Every workspace is `@app-template/<name>`: layers `{domain,http-api,application,infrastructure}`,
  packages `<dir>` (`@app-template/config`), apps `{api,worker,web}`, and `deployment`.
- A layer exposes each entity as a subpath through its barrel: `@app-template/domain/chat` →
  `domain/chat/index.ts`. `http-api` and each package have one entry, `index.ts` or `client.ts`.
- App entrypoint: `src/main.ts`.

## Imports

- **Inside a workspace:** `#<workspace>/<path>` (declared in its `package.json` `imports`), never
  `./` or `../`. Example: `#domain/chat/chat.model`, `#api/layer`.
- **Across workspaces:** `@app-template/<workspace>[/<entity>]`, only downward:
  `apps` → `application` → `infrastructure` → `domain`, and `apps` → `http-api` → `domain`;
  `packages/*` serve every layer except `domain` and `http-api`. Full matrix:
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
| `.use-case` | a flow that composes services: `<verb>-<object>.use-case.ts` | application |
| `.job` | a queue's producer service and its worker | application |
| `.repository` · `.storage` · `.llm` | an adapter over a client; prompt functions live in `.llm` | infrastructure |
| `.queue` | queue definitions | infrastructure |
| `.client` | client wiring | infrastructure/shared, http-api, packages |
| `.http` | a contract group: one resource's HTTP routes (`HttpApiGroup`) | http-api |
| `.handler` | a request handler | apps |
| `.test` | a colocated test that mirrors its source name | any |
| `.fixture` | sample values (ids, dates, inputs, bytes); no Effect, no layers | `testing/` |
| `.fake` | a test implementation or wrapper of a port or service: records, yields, scripts | `testing/` |
| `.harness` | real services over fakes and the memory store; runner, arrange steps, reads for assertions | `testing/` |

`<entity>` is singular, like its folder (`user/user.http.ts`); a file with no role keeps a bare
kebab name (`layer.ts`, `main.ts`). Test-support roles live only in a `testing/` folder, which no
barrel or `exports` lists, save the `packages/testing` workspace's `index.ts`.

## Symbols

- Types are `PascalCase` `<Entity><Role>`: `ChatRepository`, `ChatService`; a use case is
  `<Verb><Object>UseCase` (`SendMessageUseCase`).
- Errors are `<Entity><Problem>Error`, in every workspace (`RequestInvalidError` in `http-api`).
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
  - `find`: a read over ports in a service or job that returns the record (as an `Option`, or
    failing with its `*NotFoundError` or a refusal) or a lookup result (`findReply`,
    `findOwnedChat`, `findBindable`); a port method never uses it;
  - `select` / `insert` / `update` / `upsert` / `delete`: persistence (`selectById`); `update`
    changes an existing record and never creates one.
- Constants are `camelCase` with `as const` for literals. A `Layer` constant for a service
  declared elsewhere is `PascalCase` `<Service><Variant>` (`ChatRepositoryKv`).
- Test support: a fixed fake layer is `<Service><Variant>` (`AttachmentRepositoryYielding`); a
  stateful fake `<verb><Thing>()` returns `{ <handle>, layer }` (`recordLogs`,
  `interleaveMessages`); a harness is `make<Entity>Harness()`, its runner `with<Entity>(body)`.
