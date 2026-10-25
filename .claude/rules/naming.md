---
paths:
  - "**/*.ts"
  - "**/package.json"
---

# Naming and imports

## Workspaces

- Every workspace is `@app-template/<name>`: layers `{domain,http-api,application,infrastructure}`,
  packages `<dir>` (`@app-template/config`), apps `{api,worker,web}`, and `deployment`.
- A layer exposes each entity as a subpath through its barrel: `@app-template/domain/chat` →
  `domain/chat/index.ts`. `http-api` and each package have one entry, `index.ts` or `client.ts`;
  a package and `application` may add `./testing` (`Files` below).

## Imports

- **Inside a workspace:** `#<workspace>/<path>` (declared in its `package.json` `imports`), never
  `./` or `../`. Example: `#domain/chat/chat.model`, `#api/layer`.
- **Across workspaces:** `@app-template/<workspace>[/<entity>]`; which workspace may import which:
  [architecture.md › Dependency rules](../../docs/knowledge/architecture.md#dependency-rules).

## Files

All source files are `kebab-case` with at most one dotted role suffix, `<entity>.<role>.ts`:

| Suffix | Role | Layer |
|---|---|---|
| `.id` | the aggregate's branded ids, the only file other aggregates' models import | domain |
| `.model` · `.error` | entity types and value shapes · domain errors | domain |
| `.service` | domain: ports + pure operations · application: a service over ports | domain, application |
| `.use-case` | a flow that composes services: `<verb>-<object>.use-case.ts` | application |
| `.job` | a queue's producer service and its worker | application |
| `.repository` · `.storage` · `.llm` | an adapter over a client; prompt functions live in `.llm` | infrastructure |
| `.entity` | an entity's Drizzle tables and their row codecs, one file per entity | infrastructure |
| `.queue` | queue definitions | infrastructure |
| `.relay` | a layer that moves records from the database to a queue (`OutboxRelay`) | infrastructure |
| `.client` · `.transport` | client wiring · the service a package's client runs over (`QueueTransport`) | infrastructure/shared, infrastructure/db, http-api, packages |
| `.http` | a contract group: one resource's HTTP routes (`HttpApiGroup`) | http-api |
| `.handler` | a request handler | apps |
| `.test` | a colocated test that mirrors its source name, or names what it checks against (`resources.test.ts`: the inventory in `packages/aws`) | any |
| `.fixture` | sample values (ids, dates, inputs, bytes); no Effect, no layers | `testing/` |
| `.fake` | a test implementation or wrapper of a port or service: records, yields, scripts | `testing/` |
| `.harness` | a test layer (real services over fakes, the fixtures it inserts), its arrange and read steps | `testing/` |
| `.setup` | a vitest `globalSetup` module: run-wide resources, handed to tests through `provide` | `testing/` |

`<entity>` is singular, like its folder (`user/user.http.ts`); a file with no role keeps a bare
kebab name (`layer.ts`), and a tool's config file the name its tool reads (`drizzle.config.ts`).
Test-support roles live only in `testing/`, listed by no barrel or `exports` save: the
`packages/testing` index; a package's `./testing` for a double or test layer of its own
(`@app-template/queue/testing`; `packages/testing` would form an import cycle); and
`@app-template/application/testing`, which the apps' suites compose instead of copying.

## Symbols

- Types are `PascalCase` `<Entity><Role>`: `ChatRepository`, `ChatService`; a use case is
  `<Verb><Object>UseCase` (`SendMessageUseCase`).
- Errors are `<Entity><Problem>Error`, in every workspace (`RequestInvalidError` in `http-api`).
- Functions are verb-first, and the verb marks the kind of work:
  - `create<Thing>`: a factory that wires dependencies;
  - `layer<Variant>`: a static that builds the service's `Layer` for one variant
    (`effect-services.md › Layers`); a combinator or constant that returns a `Layer` running
    work is named for what it runs (`worker`, `OutboxRelay`);
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
  declared elsewhere is `PascalCase` `<Service><Variant>` (`ChatRepositoryPg`); `<Entity>Pg` in
  `<entity>/index.ts` bundles the aggregate's adapters, which a process provides.
- Test support: a fixed fake layer is `<Service><Variant>` (`AttachmentRepositoryYielding`); a
  stateful fake `<verb><Thing>()` returns `{ <handle>, layer }` (`recordLogs`,
  `interleaveMessages`); a test layer is `<Entity>Test` (`ChatTest`), `layer<Entity>Test(…)` when it
  takes options.
