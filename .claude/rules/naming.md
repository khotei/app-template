---
paths:
  - "**/*.ts"
  - "**/package.json"
---

# Naming and imports

## Files

`kebab-case`, `<name>.<role>.ts` with one role of the table, `<name>` singular like its folder; a
new suffix is a row added here first. A file whose role no row names is `<owner>-<what>.ts`, the
owner being its package's, kernel part's or app's name, or its sub-entry's (a folder with its own
`index.ts`; a model's, in a module; never a layer folder), unless its name as it stands already is
its owner's name or the kebab form of the one name it exports, or a name its tool writes or reads;
entries (`index.ts`, `main.ts`, a process's `layer.ts`), `<tool>.config.ts` and `*.generated.ts`
keep theirs. A part's `index.ts` only re-exports what other parts import, never what loads code
they do not run (a process's entry, the migration runner, testcontainers): e2e support sits
behind its own `<part>/testing/e2e` entry, which `<part>/testing` does not re-export. Which part
may import which: [architecture.md](../../docs/knowledge/architecture.md#dependency-rules); where
a test and its support go: [tooling.md › Tests](../../docs/knowledge/tooling.md#tests).

| Suffix | Role |
|---|---|
| `.model` | a domain concept's schemas (its `Schema.Class`, `<Model>Fields`, brands, literal sets) with the pure rules over them, in `domain/`, a file per value they act on (`<name>-fields.model.ts` for fields two models nest); no function here needs a service or reads the clock; its id and its utils are its `.util`'s |
| `.util` | `<model>.util.ts`, the model's branded id with the utils its module's code shares ([glossary › Architecture language](../../docs/knowledge/glossary.md#architecture-language), [decision](../../docs/knowledge/decisions.md#utils-apart-from-models)), in `domain/`, or the id alone in `contract/` when other modules take it; imports only `effect`, `@app-template/packages/schema` and other `.util` files; never a model or a rule |
| `.error` | `<Model><Problem>Error`, the errors a module fails with ([which class](effect.md#failures)), in `domain/`, or in `contract/` when other modules name it; a kernel part's error a use case names sits in its own `.error` behind an entry that loads no client (`@app-template/kernel/llm/error`) |
| `.port` | a port: a `Context.Service` the domain declares in its words for a need with several implementations, or for a domain service's reach outside, beside the values it takes and returns, in `domain/`; never one in front of a repository or of a service with one implementation, which is its own contract |
| `.service` | a domain service in a module's `services/`: `<Model>Service` in `<model>.service.ts`, one composed over it in `<aspect>-<model>.service.ts`, named for what it adds, or `<operation>.service.ts` for one operation of no model ([layering.md](layering.md#ports-and-domain-services)); a package's or a kernel part's service is named for its role (`.client`, `.sender`) |
| `.use-case` | `<verb>-<object>.use-case.ts` in `application/use-cases/<module>/`, the one `Effect.fn` `<verb><Object>` ([what it holds](layering.md#use-cases)) |
| `.queue` | `<model>.queue.ts` in a module's `infrastructure/`: each queue's definition with its job's `Schema.Class` and its `send<Job>` ([when it is sent](layering.md#use-cases)) |
| `.llm` | `<model>-assistant.llm.ts` in a module's `infrastructure/`: `<Model>Assistant`, a `Context.Service` with its `static layer`, one per output it asks a language model for (a reply, a title), holding that language model, its prompt and request settings, and piping the kernel's call policy (`@app-template/kernel/llm`); no port in front, the class is its contract |
| `.table` | `<entity>.table.ts` in `kernel/data/<store>/`, the one glob drizzle-kit reads: a Drizzle table with any table it alone owns, the values its checks declare (a limit, a pattern, an enum's values, a JSON column's shape) under a name the domain's guard admits (`<name>Length`, `<name>Pattern`, `<name>Statuses`, `<Name>Failure`, …), and `<Name>Columns`; never a model |
| `.entity` | `<Name>Entity`, the one shape every read of its store returns, with the types its repository's verbs take (`Where`, `Set`, an `Insert` where an insert is no row, a `<Verb>Where`, `Downloaded<Name>Entity`: [repositories.md](repositories.md#a-deep-repository)) and `build<Name>Entity` where a read's shape differs; imports only tables and entities |
| `.repository` | `<Name>Repository` in `kernel/data/<store>/`, one store's `Context.Service` over `Db` or a package's client, reading and writing its entities by the verbs of [Symbols](#symbols) over a `where` typed from the entity; never a model, a rule or `Config` |
| `.client` | a client of one external system (a database, a bucket, a queue, a provider's or another app's API): in a package or an app its `Context.Service` or constructor, settings as options; the data layer's `Db`, over the client in context; in a kernel part `<Client>FromConfig`, the `Layer` that builds one from `@app-template/kernel/config`; never `Config` in a package or the data layer |
| `.sender` · `.consumer` | the two ends of `packages/queue`: `QueueSender`, the client that sends a definition's job with the current trace · `consumeQueue`, the function that runs a handler on each job a batch delivers; a module's own sends are its `.queue` file's |
| `.http` | `<Name>Http` in `apps/api/<resource>/`: one resource's `HttpApiGroup` over the domain's ids, models and errors, each error's status at its endpoint, with a wire shape (`Api<Model>`, `<Model>.mapFields(…)`) only where it differs from the model ([apps/CLAUDE.md](../../apps/CLAUDE.md)) |
| `.mapper` | `buildApi<Model>` beside its `.http`, the pure function from a model to its `Api<Model>`, only where the wire adds or renames a field; a model's row needs none, the model is its codec |
| `.handler` | the function that serves one request or one job: the api's `<Name>Handler`, one group's handlers beside its `.http`, each calling one service method or one use case; the worker's one route, running each queue's use case through `consumeQueue` ([layering.md](layering.md#handlers)) |
| `.test` · `.e2e` | a unit test in `__tests__/`, no process outside vitest · a test on the e2e run's containers, in `__e2e__/` or `apps/e2e`; each named for the source it mirrors, or for what it checks when it mirrors none |
| `.test-fixture` | sample values and the functions that build them (`<thing>At(n)`), plain data: no `Effect` to run, no layer |
| `.test-util` | a function or constant tests and test layers call: an assertion, a predicate, a builder of a value, a stream or an error, or an effect on the e2e run's containers (a stage's provisioning); it builds no layer and doubles no service |
| `.test-fake` | the test double of one service, port or leaf, named as [Symbols](#symbols) says (`<Service>Test`, a stateful `<verb><Thing>()`, a variant that refuses); a function that doubles nothing is a `.test-util`'s |
| `.test-layer` | the layer a test provides: a unit's real services over mocks and fakes (`layer<Model>Test(…)`), or a client on the e2e run's containers (`<Client>Test`) |
| `.test-setup` | the e2e run's vitest `globalSetup`, which starts the containers and provides their addresses |

## Symbols

- Types are `PascalCase` `<Name><Role>`: `<Model><Problem>Error`, a port's `<Port><Problem>Error`,
  `<Model>Service` (`<Aspect><Model>Service` composed over it) or, for one operation of no model,
  that operation; the last grouping before a use case is `<Verb><Model>Service`, its main method
  `<verb>`, the verb it names, any other named for its own act in the model's words.
- Functions are verb-first, and the verb marks the kind of work (whether a name passes:
  [name-and-body.md](name-and-body.md)):
  - `create<Thing>`: a factory that takes dependencies and assembles them, or a write that takes
    a new record's fields and stores it (a domain service's `create`, a use case's step over it);
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
