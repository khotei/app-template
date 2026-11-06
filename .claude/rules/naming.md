---
paths:
  - "**/*.ts"
  - "**/package.json"
---

# Naming and imports

## Imports

- A unit reaches its own files through `#<unit>/<path>`, another unit only through its entry or
  its `/testing` (`make check` refuses the rest). Which may import which:
  [architecture.md › Dependency rules](../../docs/knowledge/architecture.md#dependency-rules).
- A unit's `index.ts` only re-exports; code it would hold gets a file of its own. It re-exports
  what other units import, never what loads code they do not run (a process's entry, the
  migration runner, testcontainers): e2e support sits behind its own `<unit>/testing/e2e` entry,
  which the `<unit>/testing` one does not re-export.

## Files

`kebab-case`, `<name>.<role>.ts`, one role suffix, `<name>` singular like its folder; a file with
no role keeps a bare name (`layer.ts`), a tool's file the name its tool reads. Where a test and
its support go: [tooling.md › Tests](../../docs/knowledge/tooling.md#tests).

| Suffix | Role |
|---|---|
| `.id` · `.model` · `.error` | branded ids · `Schema.Class`es and their pure operations, split by the value they act on · domain errors; the contract declares its own in its `.http` files, under the domain's export names |
| `.port` | a module's ports, `Context.Service`s, beside the values they take and answer |
| `.service` | a domain service: `<model>.service.ts`, or `<operation>.service.ts` for one operation of no model |
| `.use-case` | `<verb>-<object>.use-case.ts`, a flow over domain services |
| `.handler` | api: one contract group's handlers · worker: `<object>.handler.ts`, one queue's |
| `.repository` · `.llm` · `.queue` | a store's access · `LanguageModel` with its prompts · queue definitions and their job schemas |
| `.relay` | a layer moving records from the database to a queue |
| `.table` · `.entity` | a table · `<Name>Entity` with its `Insert`, `Where` and `Set`, and a `<Verb>Where` for the one verb whose filter differs |
| `.mapper` | `<Model>FromEntity`, an entity's codec into a model · api: `buildApi<Model>`, a model handed to its wire shape, one per response model |
| `.client` · `.transport` · `.http` | client wiring · the service a package's client runs over · one resource's routes |
| `.test` · `.e2e` | a unit test, no process outside vitest · a test on the run's containers |
| `.test-fixture` · `.test-util` | sample values, no Effect, no layer · an assertion or value helper, no layer |
| `.test-fake` · `.test-layer` · `.test-setup` | a port's or service's test implementation · real services over fakes or containers · a vitest `globalSetup` |

## Symbols

- Types are `PascalCase` `<Name><Role>`: `<Model><Problem>Error`, a port's `<Port><Problem>Error`,
  `<Verb><Object>UseCase`, `<Model>Service` or, for one operation of no model, that operation.
- Functions are verb-first, and the verb marks the kind of work:
  - `create<Thing>`: a factory that wires dependencies;
  - `layer<Variant>`: a static building one variant of a service's `Layer`; a `Layer` that runs
    work is named for it;
  - `build` / `ensure`: a pure function that derives a value or guards an invariant; a pure
    transition is named for the status it moves to, as a verb, which wins over this list;
  - `generate`: an impure function that makes a fresh value; `is` / `has`: a predicate;
  - `getOne` / `getMany`: a domain service's read over a `where`, answering the records or their
    `*NotFoundError`;
  - `select<One|Many>` / `insert` / `update` / `delete`: a repository's; `update` never creates.
- Other constants are `camelCase`, `as const` for literal objects and arrays; a `Layer` constant
  is `PascalCase`, `<Service><Variant>` for a service declared elsewhere.
- A test-only layer ends in `Test`: a fake `<Service>Test`, a model's real services over fakes
  `<Model>Test` (`layer<Model>Test(…)`). A stateful fake `<verb><Thing>()` returns
  `{ <handle>, layer }`; `<Name>Rows` holds a memory layer's rows.
