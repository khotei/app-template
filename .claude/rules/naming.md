---
paths:
  - "**/*.ts"
  - "**/package.json"
---

# Naming and imports

## Imports

- **Inside a workspace:** `#<workspace>/<path>` (`#domain/<entity>/<entity>.model`), never `./`
  or `../`.
- **Across workspaces:** `@app-template/<workspace>[/<entity>]`: a layer exposes each entity as a
  subpath through its `index.ts` barrel, plus `./testing`; `http-api` and each package have one
  entry, no per-entity barrels; which may import which:
  [architecture.md › Dependency rules](../../docs/knowledge/architecture.md#dependency-rules).

## Files

Source files are `kebab-case`, `<entity>.<role>.ts` with one role suffix and `<entity>` singular
like its folder; a file with no role keeps a bare name (`layer.ts`), a tool's config the name its
tool reads.

| Suffix | Role | Where |
|---|---|---|
| `.id` | the aggregate's branded ids, the only value another aggregate's model imports, save a model it holds as a field it never writes; a port may `import type` another aggregate's model | domain |
| `.model` · `.error` | `Schema.Class`es with the pure operations on them (builders, predicates, guards, transitions), split by the value they act on, never into a `.rule` · domain errors | domain |
| `.port` | an entity's ports, `Context.Service`s with no layer, beside the values they take and answer: `<Entity>Where`, shared by every verb that filters alike, and `<Entity><Verb>Where` for the one verb whose filter differs | domain |
| `.service` | a domain service: `<entity>.service.ts` for an entity's rules, `<operation>.service.ts` for one operation that belongs to no entity | domain |
| `.use-case` | a flow over domain services: `<verb>-<object>.use-case.ts` | application |
| `.handler` | api: one contract group's handlers · worker: `<object>.handler.ts`, one queue's `handle` and `handleDeadLettered` over a use case | apps |
| `.repository` · `.bucket` · `.llm` · `.queue` · `.relay` | a port's adapter over Postgres · S3 · `LanguageModel`, with the prompts · queue definitions and their job schemas · a layer that moves records from the database to a queue | infrastructure |
| `.table` · `.entity` | a table, importing only tables · its entities, the schemas read from it, `<Name>Entity` with its `Insert`, `Where` and `Set` | `kernel/data` |
| `.mapper` | an entity's codec into a model, `<Model>FromEntity` | a module's `services`; `infrastructure` holds them while it remains |
| `.client` · `.transport` | client wiring · the service a package's client runs over | infrastructure, kernel, http-api, packages |
| `.http` | a contract group: one resource's routes (`HttpApiGroup`) | http-api |
| `.test` · `.e2e` | a unit test, no process outside vitest · a test on the run's containers | `__tests__/` · `__e2e__/` |
| `.test-fixture` | sample values (ids, dates, inputs, bytes); no Effect, no layers | `testing/` of either |
| `.test-fake` | a test implementation or wrapper of a port or service: records, yields, scripts | `testing/` of either |
| `.test-layer` | a test layer (real services over fakes or containers), its arrange and read steps | `testing/` of either |
| `.test-setup` | a vitest `globalSetup`: run-wide resources, handed to tests through `provide` | `__e2e__/testing/` |
| `.test-util` | an assertion or a value helper with no layer | `testing/` of either |

`__tests__/` and `__e2e__/` sit at the workspace's top and mirror the source path
(`domain/__tests__/<entity>/<entity>.model.test.ts`), or a suite with no source names what it
checks; a module folder holds no test. Test support lives only in the `testing/` inside them: a
file any unit test imports in `__tests__/testing/` (`#testing/*`, exported as `./testing`), the
rest in `__e2e__/testing/` (`#testing-e2e/*`, exported as `./testing-e2e`); a unit test never
imports e2e support. Suites compose these barrels instead of copying them: `domain`'s memory layers
and fixtures, `infrastructure`'s transaction and database and AWS harnesses, `use-cases`' test
layers, a package's own test helpers. The e2e over assembled layers, the journey among them, live
in `apps/__e2e__`.

## Symbols

- Types are `PascalCase` `<Entity><Role>` (`<Entity>Repository`), errors `<Entity><Problem>Error`
  in every workspace, a use case `<Verb><Object>UseCase`. A domain service is named by its entity
  (`<Entity>Service`), or, for one operation of no entity, by that operation alone.
- Functions are verb-first, and the verb marks the kind of work:
  - `create<Thing>`: a factory that wires dependencies;
  - `layer<Variant>`: a static that builds one variant of the service's `Layer`
    (`effect-services.md › Layers`); a `Layer` that runs work is named for it;
  - `build` / `ensure`: a pure function that derives a value or guards an invariant
    (`build<Entity>`); a pure transition is named for the status it moves to, as a verb
    (`ship<Entity>` to `shipped`; `complete<Entity>` to `done`, which no verb spells), which wins
    over this list;
  - `generate`: an impure function that makes a fresh value (`generateId` in `@app-template/db`);
  - `is` / `has`: a predicate;
  - `get`: a domain service's read over ports, never a port method; it answers the record or its
    `*NotFoundError`;
  - `select` / `insert` / `update` / `delete`: a port's persistence; `update` never creates a
    record.
- Constants are `camelCase`, `as const` for literal objects and arrays; a `Layer` constant is
  `PascalCase`, for a service declared elsewhere `<Service><Variant>` (`<Entity>RepositoryPg`);
  `<Entity>Pg` in `<entity>/index.ts` bundles the aggregate's adapters.
- Every test-only layer ends in `Test`: a port's fake is `<Port>Test`; a test layer is
  `<Entity>Test`, the entity's real services over fakes (`layer<Entity>Test(…)` with options). A
  stateful fake `<verb><Thing>()` returns `{ <handle>, layer }`; `<Entity>Rows` holds a memory
  layer's rows.
