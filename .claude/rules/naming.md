---
paths:
  - "**/*.ts"
  - "**/package.json"
---

# Naming and imports

## Workspaces

- Every workspace is `@app-template/<name>`: layers `{domain,http-api,application,infrastructure}`,
  packages `<dir>` (`@app-template/config`), apps `{api,worker,web}`, `deployment`, and `e2e`, the
  root workspace of the journey over both app layers, with `devDependencies` only.
- A layer exposes each entity as a subpath through its barrel (`@app-template/domain/chat` →
  `domain/chat/index.ts`), plus `./testing` (`Files`); `http-api` and each package have one entry,
  `index.ts` or `client.ts`, and `api` and `worker` export `./layer` alone, for `e2e`.

## Imports

- **Inside a workspace:** `#<workspace>/<path>` (`#domain/chat/chat.model`), never `./` or `../`.
- **Across workspaces:** `@app-template/<workspace>[/<entity>]`; which may import which:
  [architecture.md › Dependency rules](../../docs/knowledge/architecture.md#dependency-rules).

## Files

Source files are `kebab-case`, `<entity>.<role>.ts` with one role suffix and `<entity>` singular
like its folder (`user/user.http.ts`); a file with no role keeps a bare name (`layer.ts`), a
tool's config the name its tool reads (`drizzle.config.ts`).

| Suffix | Role | Where |
|---|---|---|
| `.id` | the aggregate's branded ids, the only value another aggregate's model imports, save a model it holds as a field it never writes (`Chat.attachments`, `Message.attachments`); a port may `import type` another aggregate's model | domain |
| `.model` · `.error` | `Schema.Class`es with the pure operations on them (builders, predicates, guards, transitions), split by the value they act on, never into a `.rule` · domain errors | domain |
| `.port` | an entity's ports, `Context.Service`s with no layer, beside the values they take and answer (`ChatWhere`, `AssistantTurn`) | domain |
| `.service` | a domain service: `<entity>.service.ts` for an entity's rules, `<operation>.service.ts` for one operation that belongs to no entity | domain |
| `.use-case` | a flow over domain services: `<verb>-<object>.use-case.ts` | application |
| `.handler` | api: one contract group's handlers · worker: `<object>.handler.ts`, one queue's `handle` and `handleDeadLettered` over a use case | apps |
| `.repository` · `.bucket` · `.llm` | a port's adapter over Postgres · S3 · `LanguageModel`, with the prompts | infrastructure |
| `.entity` · `.queue` · `.relay` | an entity's Drizzle tables and row codecs · queue definitions and their job schemas · a layer that moves records from the database to a queue | infrastructure |
| `.client` · `.transport` | client wiring · the service a package's client runs over (`QueueTransport`) | infrastructure, http-api, packages |
| `.http` | a contract group: one resource's routes (`HttpApiGroup`) | http-api |
| `.test` · `.e2e` | a unit test, no process outside vitest · a test on the run's containers | `tests/` · `e2e/` |
| `.test-fixture` | sample values (ids, dates, inputs, bytes); no Effect, no layers | `testing/` |
| `.test-fake` | a test implementation or wrapper of a port or service: records, yields, scripts | `testing/` |
| `.test-layer` | a test layer (real services over fakes or containers), its arrange and read steps | `testing/` |
| `.test-setup` | a vitest `globalSetup`: run-wide resources, handed to tests through `provide` | `testing/` |
| `.test-util` | an assertion or a value helper with no layer (`assertSchemaEquals`, `sortById`) | `testing/` |

`tests/` and `e2e/` sit at the workspace's top and mirror the source path
(`domain/tests/chat/message.model.test.ts`), or a suite with no source names what it checks
(`resources.test.ts`); a module folder holds no test. Test support lives only in a `testing/`
folder (`infrastructure/db/testing/` too), exported by no barrel save `packages/testing`'s,
`@app-template/queue/testing` (the recording queue) and the three layers' `./testing`: `domain`
(the memory layers, the fixtures), `infrastructure` (`DbTest`, `TransactionTest`, `AwsTest`) and
`application` (the use cases' test layers), which suites compose instead of copying.

## Symbols

- Types are `PascalCase` `<Entity><Role>` (`ChatRepository`), errors `<Entity><Problem>Error` in
  every workspace, a use case `<Verb><Object>UseCase`. A domain service is named by its entity
  (`ChatService`), or, for one operation of no entity, by that operation alone (`FundsTransfer`).
- Functions are verb-first, and the verb marks the kind of work:
  - `create<Thing>`: a factory that wires dependencies;
  - `layer<Variant>`: a static that builds one variant of the service's `Layer`
    (`effect-services.md › Layers`); a `Layer` that runs work is named for it (`worker`);
  - `build` / `ensure`: a pure function that derives a value or guards an invariant
    (`buildChat`); a pure transition is named for the status it moves to (`prepareMessage`);
  - `generate`: an impure function that makes a fresh value (`generateStage`);
  - `is`: a predicate (`isActiveMessage`);
  - `get` / `find`: a domain service's or use case's read over ports, never a port method:
    `get` answers the record or its `*NotFoundError` (`AttachmentService.get`), `find` an
    `Option` or a proof with its refusals;
  - `select` / `insert` / `update` / `delete`: a port's persistence; `update` never creates a
    record.
- Constants are `camelCase`, `as const` for literal objects and arrays; a `Layer` constant is
  `PascalCase`, for a service declared elsewhere `<Service><Variant>` (`ChatRepositoryPg`);
  `<Entity>Pg` in `<entity>/index.ts` bundles the aggregate's adapters.
- Every test-only layer ends in `Test`: a port's fake is `<Port>Test` (`AttachmentBucketTest`); a
  test layer is `<Entity>Test`, the entity's real services over fakes (`ChatTest`;
  `layer<Entity>Test(…)` with options). A stateful fake `<verb><Thing>()` returns
  `{ <handle>, layer }` (`recordLogs`); `<Entity>Rows` holds a memory layer's rows (`ChatRows`).
