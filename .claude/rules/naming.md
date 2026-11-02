---
paths:
  - "**/*.ts"
  - "**/package.json"
---

# Naming and imports

## Imports

- **Inside a unit:** `#<unit>/<path>` (`#<module>/domain/<model>.model`), never `./`
  or `../`; another unit, even in the same workspace, only through its entry
  (`@app-template/kernel/<part>`), never one of its files.
- **Across units:** `@app-template/<folder>`, through the `exports` and the `index.ts` barrels:
  a kernel part (`@app-template/kernel/<part>`), a package (`@app-template/packages/<name>`) and
  a module or the use cases (`@app-template/application/<module>`) one entry each:
  [architecture.md › Imports](../../docs/knowledge/architecture.md#imports-workspace-vs-app-template);
  which may import which:
  [architecture.md › Dependency rules](../../docs/knowledge/architecture.md#dependency-rules).

## Files

Source files are `kebab-case`, `<name>.<role>.ts` with one role suffix and `<name>` singular
like its folder; a file with no role keeps a bare name (`layer.ts`), a tool's config the name its
tool reads.

| Suffix | Role | Where |
|---|---|---|
| `.id` | the aggregate's branded ids, the only value another aggregate's model imports, save a model it holds as a field it never writes; a port may `import type` another aggregate's model | domain |
| `.model` · `.error` | `Schema.Class`es with the pure operations on them (builders, predicates, guards, transitions), split by the value they act on, never into a `.rule` · domain errors | domain |
| `.port` | a module's ports, `Context.Service`s with no layer, beside the values they take and answer; never a store's, which the data layer's repository serves | domain |
| `.service` | a domain service: `<model>.service.ts` for a model's rules, `<operation>.service.ts` for one operation that belongs to no model | a module's `services/` |
| `.use-case` | a flow over domain services: `<verb>-<object>.use-case.ts` | application |
| `.handler` | api: one contract group's handlers · worker: `<object>.handler.ts`, one queue's `handle` and `handleDeadLettered` over a use case | apps |
| `.repository` · `.llm` · `.queue` | the data layer's access to a store (a table or an object store), `<Name>Repository` over its entities · `LanguageModel`, with the prompts · queue definitions and their job schemas | `kernel/data` · a module's `infrastructure` · a module's `services` |
| `.relay` | a layer that moves records from the database to a queue | kernel |
| `.table` · `.entity` | a table, importing only tables · its entities, the schemas read from it, `<Name>Entity` with its `Insert`, `Where` and `Set`, and a `<Verb>Where` for the one verb whose filter differs | `kernel/data` |
| `.mapper` | an entity's codec into a model, `<Model>FromEntity` | a module's `services` |
| `.client` · `.transport` | client wiring · the service a package's client runs over | a module's `infrastructure`, kernel, http-api, packages |
| `.http` | a contract group: one resource's routes (`HttpApiGroup`) | http-api |
| `.test` · `.e2e` | a unit test, no process outside vitest · a test on the run's containers | `__tests__/` · `__e2e__/` |
| `.test-fixture` | sample values (ids, dates, inputs, bytes); no Effect, no layers | a `testing/` |
| `.test-fake` | a test implementation or wrapper of a port or service: records, yields, scripts | a `testing/` |
| `.test-layer` | a test layer (real services over fakes or containers), its arrange and read steps | a `testing/` |
| `.test-setup` | a vitest `globalSetup`: run-wide resources, handed to tests through `provide` | a `testing/e2e/` |
| `.test-util` | an assertion or a value helper with no layer | a `testing/` |

Which folder holds a test and its support, the path a test mirrors and which support it may
import: [tooling.md › Tests](../../docs/knowledge/tooling.md#tests).

## Symbols

- Types are `PascalCase` `<Name><Role>` (`<Name>Repository`), a domain error
  `<Model><Problem>Error`, a port's `<Port><Problem>Error`, a use case `<Verb><Object>UseCase`. A
  domain service is named by its model (`<Model>Service`), or, for one operation of no model, by
  that operation alone.
- Functions are verb-first, and the verb marks the kind of work:
  - `create<Thing>`: a factory that wires dependencies;
  - `layer<Variant>`: a static that builds one variant of the service's `Layer`
    (`effect-services.md › Layers`); a `Layer` that runs work is named for it;
  - `build` / `ensure`: a pure function that derives a value or guards an invariant
    (`build<Model>`); a pure transition is named for the status it moves to, as a verb
    (`ship<Model>` to `shipped`; `complete<Model>` to `done`, which no verb spells), which wins
    over this list;
  - `generate`: an impure function that makes a fresh value (`generateId` in
    `@app-template/packages/db`);
  - `is` / `has`: a predicate;
  - `get`: a domain service's read over repositories, never a repository method; it answers the
    record or its `*NotFoundError`;
  - `select` / `insert` / `update` / `delete`: a repository's persistence; `update` never creates a
    record.
- Constants are `camelCase`, `as const` for literal objects and arrays; a `Layer` constant is
  `PascalCase`, for a service declared elsewhere `<Service><Variant>` (`<Port>S3`).
- Every test-only layer ends in `Test`: a repository's or port's fake is `<Service>Test`; a test
  layer is `<Model>Test`, the model's real services over fakes (`layer<Model>Test(…)` with
  options). A stateful fake `<verb><Thing>()` returns `{ <handle>, layer }`; `<Name>Rows` holds
  a memory layer's rows.
