---
paths:
  - "**/*.ts"
  - "**/package.json"
---

# Naming and imports

## Files

`kebab-case`, `<name>.<role>.ts` with one suffix of the table, `<name>` singular like its folder; a
new suffix is a row added here first. A file whose role no row names is `<owner>-<what>.ts`, the
owner being its package's, kernel part's or app's name, or its sub-entry's (a folder with its own
`index.ts`; a model's, in a module; never a layer folder), unless its name as it stands already is
its owner's name or the kebab form of the one name it exports, or a name its tool writes or reads;
entries (`index.ts`, `main.ts`, a process's `layer.ts`), `<tool>.config.ts` and `*.generated.ts`
keep theirs. What each role holds and may import, with this app's files of each:
[architecture.md › Where things live](../../docs/knowledge/architecture.md#where-things-live).

| Suffix | Holds | Where |
|---|---|---|
| `.model` | a concept's schemas and the errors its rules fail with, a file per value they act on; its rules in `<model>-<kind>.ts`, one group each ([models.md](models.md)) | `domain/` |
| `.util` | `<model>.util.ts`: the model's branded id and the utils its module shares, importing only `effect`, `packages/schema` and other utils | `domain/`; the id alone in `contract/` |
| `.error` | the errors a contract or a kernel part fails with; a model's live in its `.model` file | `contract/`; a kernel part's, behind an entry of its own |
| `.port` | a service the domain declares to reach outside, with the values it takes and returns | `domain/` |
| `.service` | `<model>.service.ts`, `<aspect>-<model>.service.ts` composed over it, `<operation>.service.ts` for one of no model | `services/`; a package's or kernel part's takes its role's (`.client`, `.sender`) |
| `.use-case` | `<verb>-<object>.use-case.ts`: one use case | `application/use-cases/<module>/` |
| `.queue` · `.llm` | `<model>.queue.ts`: the queues' definitions, jobs and `<Model>Queue`, their sends · `<model>-assistant.llm.ts`: one assistant per output asked of a language model | `infrastructure/` |
| `.table` · `.entity` · `.repository` | a table with any it alone owns (drizzle-kit reads `*/*.table.ts`) · `<Name>Entity` and its verbs' types · one store's access | `kernel/data/<store>/` |
| `.client` | a client of one external system, or the layer that builds it | a package, an app, `kernel/data`, a kernel part |
| `.sender` · `.consumer` | the queue's send · its run of a handler per job | `packages/queue` |
| `.http` · `.mapper` · `.handler` | a resource's `HttpApiGroup` · its model's wire shape, where it differs · its handlers, or the worker's route | `apps/api/<resource>/`; `apps/worker/` |
| `.test` · `.e2e` | a unit test · a test on the e2e run's containers, each named for its source | `__tests__/` · `__e2e__/`, `apps/e2e` |
| `.test-fixture` · `.test-util` | sample values, plain data · a helper, building no layer and doubling nothing | `__tests__/testing/` |
| `.test-fake` · `.test-layer` · `.test-setup` | one service's double · the layer a test provides · the e2e run's `globalSetup` | `__tests__/testing/`, `e2e/` for e2e support |

## Symbols

- Types are `PascalCase` `<Name><Role>`: `<Model><Problem>Error`, a port's `<Port><Problem>Error`,
  `<Model>Service` (`<Aspect><Model>Service` composed over it) or, for one operation of no model,
  that operation; the last grouping before a use case is `<Verb><Model>Service`, its main method
  `<verb>`, the verb it names, any other named for its own act in the model's words.
- A domain service's method types an object it takes from its model: new or changed fields are a
  variant (`typeof Order.jsonCreate.Type`, `typeof Order.jsonUpdate.Type`), a where the model's one
  `<Model>Where`, which a method narrows in place (`SetRequired<OrderWhere, 'customerId'>`, a
  `Pick`). Only what neither gives is a type of its own, `<Model><Method>` with the argument's
  role when the method takes two (`OrderCreate`, `OrderUpdateWhere`).
- Functions are verb-first, and the verb marks the kind of work (whether a name passes:
  [name-and-body.md](name-and-body.md)):
  - `create<Thing>`: a factory that takes dependencies and assembles them, or a write that takes
    a new record's fields and stores it (a domain service's `create`, a use case's step over it);
  - `layer<Variant>`: a static building one variant of a service's `Layer`; a `Layer` that runs
    work is named for it;
  - `build` / `ensure`: a pure function that derives a value or guards an invariant; a pure
    transition, a static of `<Model>Move`, is named for the move, as a verb (`start`,
    `complete`, `fail`), which wins over this list;
  - `generate`: an impure function that makes a fresh value; `is` / `has`: a predicate;
  - `getOne` / `getMany`: a domain service's read over a `where`, returning the records or their
    `*NotFoundError`; `get<Payload>` a payload a record's store holds (its bytes), or its
    `*NotFoundError`; `delete<Payload>` that payload's removal, the record's left to its owner;
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
