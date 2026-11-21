---
paths:
  - "**/*.ts"
  - "**/package.json"
---

# Naming and imports

## Imports

- Which unit may import which:
  [architecture.md › Dependency rules](../../docs/knowledge/architecture.md#dependency-rules).
- A unit's `index.ts` only re-exports; code it would hold gets a file of its own. It re-exports
  what other units import, never what loads code they do not run (a process's entry, the
  migration runner, testcontainers): e2e support sits behind its own `<unit>/testing/e2e` entry,
  which the `<unit>/testing` one does not re-export.

## Files

`kebab-case`, `<name>.<role>.ts`, one role suffix, `<name>` singular like its folder; a file
with no role keeps a bare name (`layer.ts`), a tool's file the name its tool reads, and a file a
tool writes from another `<name>.generated.ts`. Where a test
and its support go: [tooling.md › Tests](../../docs/knowledge/tooling.md#tests).

| Suffix | Role |
|---|---|
| `.model` · `.error` | `Schema.Class`es and their pure operations, split by the value they act on · domain errors |
| `.util` | `<model>.util.ts`: the model's branded id and its utils ([glossary › Architecture language](../../docs/knowledge/glossary.md#architecture-language), [record](../../docs/knowledge/decisions.md#utils-apart-from-models)); it imports only `effect`, `@app-template/packages/schema` and other `.util` files, never a model |
| `.port` | a module's ports, `Context.Service`s, beside the values they take and return |
| `.service` | a domain service: `<model>.service.ts`, `<aspect>-<model>.service.ts` for one composed over it, named for what it adds, or `<operation>.service.ts` for one operation of no model |
| `.use-case` | `<verb>-<object>.use-case.ts`, a flow over domain services, the function `<verb><Object>` |
| `.handler` | api: one HTTP group's handlers · worker: its one route, each queue's use case |
| `.repository` · `.llm` · `.queue` | a store's access · `LanguageModel` with its prompts · a module's queues: their definitions, job schemas and each job's `send<Job>` |
| `.table` · `.entity` | a table · `<Name>Entity` with its `Where` and `Set`, an `Insert` only where an insert is no table's row, a `<Verb>Where` for the one verb whose filter differs, and `Downloaded<Name>Entity` for the read that adds a payload |
| `.mapper` | api: `buildApi<Model>`, a model handed to a wire shape that adds or renames a field; a model's row needs none, it is its own codec |
| `.client` · `.http` | client wiring · one resource's routes |
| `.consumer` | the function that runs a queue's handler on what it delivers |
| `.test` · `.e2e` | a unit test, no process outside vitest · a test on the run's containers |
| `.test-fixture` · `.test-util` | sample values, no Effect, no layer · an assertion or value helper, no layer |
| `.test-fake` · `.test-layer` · `.test-setup` | a port's or service's test implementation · real services over fakes or containers · a vitest `globalSetup` |

## Symbols

- Types are `PascalCase` `<Name><Role>`: `<Model><Problem>Error`, a port's `<Port><Problem>Error`,
  `<Model>Service` (`<Aspect><Model>Service` composed over it) or, for one operation of no model,
  that operation.
- Functions are verb-first, and the verb marks the kind of work (whether a name passes:
  [name-and-body.md](name-and-body.md)):
  - `create<Thing>`: a factory that takes dependencies and wires them, or a write that takes a
    new record's fields and stores it (a domain service's `create`, a use case's step over it);
  - `layer<Variant>`: a static building one variant of a service's `Layer`; a `Layer` that runs
    work is named for it;
  - `build` / `ensure`: a pure function that derives a value or guards an invariant; a pure
    transition is named for the move, as a verb (`start<Model>`, `complete<Model>`,
    `fail<Model>`), which wins over this list;
  - `generate`: an impure function that makes a fresh value; `is` / `has`: a predicate;
  - `getOne` / `getMany`: a domain service's read over a `where`, returning the records or their
    `*NotFoundError`; `get<Payload>` a payload a record's store holds (its bytes), or its
    `*NotFoundError`; `delete<Payload>` that payload's removal, the record's left to its owner;
  - `get<Qualifier>`: a domain service's read of the one record another key and a qualifier name
    (`getActive(<key>)`), returning the record itself or its own `<Qualifier><Model>NotFoundError`;
  - `list`: a domain service's read by the user alone, with no `where`, of the set a user browses;
  - `select<One|Many>` / `insert` / `update` / `delete`: a repository's; `update` never creates.
- A job is named `<Verb><Object>` in the glossary's words for the work it asks of its worker
  (`ShipOrder`), never after a method, its queue or one step of the work; its queue
  (`ship-order`), its `send<Job>` and the use case that ends it (`shipOrder`) take that name.
- Other constants are `camelCase`, `as const` for literal objects and arrays; a `Layer` constant
  is `PascalCase`, `<Service><Variant>` for a service declared elsewhere.
- A test-only layer ends in `Test`: a fake `<Service>Test`, a model's real services over fakes
  `<Model>Test` (`layer<Model>Test(…)`). A stateful fake `<verb><Thing>()` returns
  `{ <handle>, layer }`.
