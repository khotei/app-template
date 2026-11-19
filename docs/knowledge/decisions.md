# Decisions

The architecture decisions that bind the code today, one record each: why it holds, what it costs,
what refuses a change that breaks it, and what a reversal would undo. **Read a decision's record
before changing a module boundary, the data layer, the kernel, a guard or anything a record
names, and state the consequences first.** A change to a decision rewrites its record in the
same commit; a new binding decision adds one. The history, the dates and the rounds stay in the
ticket that made it and in `git log`.

Each record has seven fields: **Why**, **Sources**, **Rejected**, **Cost**, **Guarded by**, **If
reversed** and **Revisit when**. The guide is the Software Architecture Guild's
[architecture guide](https://software-architecture-guild.com/guide/architecture/); the ticket
that made these records is `docs/tickets/2026-10-31-0926_modular-monolith/`, its sources in
[research.md](../tickets/2026-10-31-0926_modular-monolith/research.md). Decisions older than it
live in `architecture.md › Decisions` of their tickets
([architecture.md](architecture.md) names them). How the code is cut and what may import what:
[architecture.md › Dependency rules](architecture.md#dependency-rules).

**Where the app departs from the guide, on purpose:** one data layer for every module
([The data at the centre](#the-data-at-the-centre)), every module writing any record
([Records open, rules called](#records-open-rules-called)), the HTTP layer outside the modules
([HTTP outside the modules](#http-outside-the-modules)) and a transaction across modules
([Use cases above the modules](#use-cases-above-the-modules)).

## Modules

### Modules by capability

The behaviour is split by business capability, a module per capability under `application/`;
attachments stay in `chat`.

- **Why:** a module owns what changes together. Chat and attachments imported each other in 8 + 3
  files and share the send's transaction and the delete's cascade. `identity` names the
  capability, and `user` is reserved in Postgres.
- **Sources:** the guide's "a module's mission fits one sentence" and "what always changes
  together belongs in one module"
  ([defining-components](https://software-architecture-guild.com/guide/architecture/boundaries/defining-components/));
  the ticket's count of the imports.
- **Rejected:** a `drive` module for the files now: the coupling becomes two-way and the send a
  flow across modules. A module per table: the guide's anemic modules.
- **Cost:** `chat` is the largest module.
- **Guarded by:** review; no tool sees a capability.
- **If reversed:** files moved out today make the send and the delete span two modules, and
  `chat` would import the new module's internals or its contract both ways.
- **Revisit when:** `shared-files` gives files a life outside a chat; it splits `drive` out with
  its services.

### Use cases above the modules

Every use case lives in `application/use-cases`, above the modules: synchronous, one transaction
whatever modules it touches; no events, facades or reactions between modules. A use case
composes the modules' services, holds the transaction, orders the writes against a store outside
it and enqueues the jobs; a rule stays in its module. It reads or writes a repository itself only
where no rule applies ([layering.md › Use cases](../../.claude/rules/layering.md#use-cases)).
The shape: [architecture.md › A use case](architecture.md#a-use-case).

- **Why:** one home for every flow, so a flow that grows a second module does not move; one path
  from the request to the last write, debuggable without following an event; one transaction for
  free on one database.
- **Sources:** departs from the guide's "Transactions are local to a module; cross-module
  workflows coordinate with events or explicit orchestration"
  ([styles/modular-monolith](https://software-architecture-guild.com/guide/architecture/styles/modular-monolith/));
  the guide's "Async messaging does not magically reduce coupling strength"
  ([dimensions](https://software-architecture-guild.com/guide/architecture/boundaries/dimensions-of-coupling/)).
- **Rejected:** a module's own use cases in its `services/`, only the spanning ones above: two
  homes, and a flow moves when it grows a module. Reactions through jobs: the request, event, job
  path is hard to debug in production. A transaction per module: it guards a data boundary the
  data layer does not have.
- **Cost:** a module's flows live outside the module; a shared transaction makes a module harder
  to extract.
- **Guarded by:** the rows of a module's layers in
  [architecture.md › Dependency rules](architecture.md#dependency-rules);
  `.claude/rules/modules.md` refuses a rule in a use case and a job that carries a module's
  reaction to another module's write.
- **If reversed:** events between modules need an event ledger, a handler per reaction and
  at-least-once delivery; a send that spans modules loses its one transaction.
- **Revisit when:** a module must be extracted into its own process, or a flow must outlive the
  request it starts in for a reason other than slow work.

### Use cases as functions

A use case, and a job's sender, is an `Effect.fn` that yields what it composes, its type
inferred. The process provides the services it reads: the api in `ApiHttp`, after
`HttpRouter.serve`, the worker in its layer.

- **Why:** a `Context.Service` per use case wrote its method's type a second time, the endpoint's
  errors among it, and closed its services in a layer that each handler group or route provided
  again; only the worker's route test stood in for one. `HttpRouter.serve` makes a handler's
  requirement per request the served layer's
  (`repos/effect/packages/effect/src/http/HttpRouter.ts:1343-1373`), so a function a handler
  calls finds its services there.
- **Sources:** `repos/effect/packages/effect/HTTPAPI.md › Using Services Inside a
  HttpApiEndpoint`; departs from `repos/effect/LLMS.md › Writing Effect services` ("Prefer using
  services to encapsulate behaviour").
- **Rejected:** the class with its `Shape` inferred from `make`: its layer and provide lists
  stay. The services provided in each handler group: a handler's own requirement is a request's
  (`repos/effect/packages/effect/src/http-api/HttpApiBuilder.ts:222-232`), which the group's
  provide never reaches, so `tsc` refuses the process.
- **Cost:** a flow that reads a service its process lacks fails `tsc` at the process's `main.ts`
  and its tests, not at the flow; a unit test merges its doubles into the layer it provides
  (`Layer.provideMerge`), since the flow reads them itself; the worker's route test mocks the
  leaves, not the use cases; a span is the function's name; the api provides services two ways,
  `ApiHttp` those a use case reads and a group or a middleware one only it reads.
- **Guarded by:** `tsc`: a service the process does not provide, an error the endpoint does not
  list, a job's failure at `consumeQueue`.
- **If reversed:** each use case and the sender become a `Context.Service` whose layer provides
  the services it composes, and each handler group and the worker's route provide those layers.
- **Revisit when:** a use case needs a second implementation, a test double or state of its own.

### Module contracts

A module other modules need exposes a contract, a folder of the module created with its first
consumer, `application/<module>/contract/`, exported through the module's one entry with the
rest of the module. A dependency on a module's contract counts as one on the module.

- **Why:** `chat` needs a few names of identity and little else; one entry per module is all a
  caller must know, and the kernel's parts work the same way.
- **Sources:** the guide's "design contracts around use cases, not around internal entity
  models"
  ([contracts](https://software-architecture-guild.com/guide/architecture/boundaries/contracts/));
  Spring Modulith's named interfaces and Packwerk's public folder (research).
- **Rejected:** the contract as its own workspace: the linker refused the rest of the module,
  but a nested workspace needed `exclude` and a reference in its module's `tsconfig.json`, and a
  second package name for one module. A second entry for the contract: two ways in for one
  module. A Biome list of the contract's names (`allowImportNames`) or a ban
  by name (`importNamePattern`): review holds the names instead.
- **Cost:** the entry opens the module whole, so which of its names another module takes is
  review's (`modules.md`), not Biome's.
- **Guarded by:** the rows of a module's layers and of a contract in
  [architecture.md › Dependency rules](architecture.md#dependency-rules);
  `.claude/rules/modules.md` refuses a name past the contract, a module importing one above it
  and a cycle through contracts.
- **If reversed:** a consumer that takes the module's entry reaches its services and
  models, and two modules can depend on each other with no tool noticing.
- **Revisit when:** a second consumer needs more of a module than its contract holds: grow the
  contract, never import past it.

### A module's layers

A module holds `domain/`, `services/` and, once it reaches the environment, `infrastructure/`,
behind one entry, its `index.ts`, which re-exports every layer; its files reach each other
through aliases that name the module (`#<module>/domain/*`). A module's `infrastructure/` holds
everything of the module that connects to the environment (a language model, a queue, a
bucket): the adapters of its ports and its queues' definitions. A repository is no port: a
service calls the data layer's repository directly.

- **Why:** `domain/` holds the rules as pure functions over values passed in, so what reads the
  data cannot sit there. Nothing of it reaches the browser any more
  ([The API contract in the api](#the-api-contract-in-the-api)), so it takes from the data layer
  the values its tables declare (a limit, a pattern, an enum's values) instead of declaring them
  again, and keeps its own brands, models and refinements: the vocabulary is the domain's, and
  the data layer stays free of models ([The data at the centre](#the-data-at-the-centre)). The
  data layer's repository already is the contract a service needs, and a port with an adapter
  over it would repeat its methods; the aliases keep the layer in every import line, so each
  layer's Biome override matches the others by glob (`#*/services/**`). A handler calls one
  service method or one use case, never a repository, so each record has one owner every caller
  goes through.
- **Sources:** the guide's "Keep internal layering per module"
  ([styles/modular-monolith](https://software-architecture-guild.com/guide/architecture/styles/modular-monolith/));
  `.claude/rules/layering.md`.
- **Rejected:** ports in `domain/` with adapters over the data layer: two layers with the same
  methods. An export per layer (`/chat/domain`): a caller must know the module's inside. The same
  `#domain/*` aliases in every module: inside one workspace they would collide. The domain taking
  the data layer's schemas too: the tables would first declare a brand and a checked column for
  every id and constrained string, and own the domain's vocabulary, against
  [.claude/rules/modules.md › A service rule or a model in the kernel](../../.claude/rules/modules.md#a-service-rule-or-a-model-in-the-kernel).
  A leaf package of shared values for the data layer and the domain: the values would leave
  the tables that check them, and the wire takes them through the domain's schemas.
  The domain's own copies kept: a value could drift between the two declarations. The queues'
  definitions in `services/`: the services' guard would admit `@app-template/kernel/aws` and
  `@app-template/packages/queue`.
- **Cost:** a service depends on the data layer directly, so its unit tests mock the data layer's
  repositories; the domain loads the data layer's entry, and its guard admits of it only the names
  of a value's shape, so a value of a new shape widens the guard's pattern; one entry opens the
  module whole, so another unit's ban on a layer matches the names it imports. A layer's override
  covers its tests, so what they need passes in its source too. What passes every guard:
  [architecture.md › Known gaps](architecture.md#known-gaps).
- **Guarded by:** one Biome override per layer, matching every module by glob and covering the
  layer's tests, the domain's admitting of the kernel only `@app-template/kernel/data`, and of
  it only a value's name (`<name>Pattern`, `<name>Statuses`), the services' admitting neither
  `@app-template/kernel/aws` nor `@app-template/packages/queue`: the rows of a module's layers in
  [architecture.md › Dependency rules](architecture.md#dependency-rules); `make bundle-check`,
  which reads the web bundle's metafile and refuses the module's package in it;
  `.claude/rules/layering.md`, a repository or the data layer in an app's handler.
- **If reversed:** a port per repository comes back with an adapter each that only delegates; an
  export per layer brings back the subpaths and a ban per layer by path; a domain without the
  data layer declares each value again, and a mapper's unit test per value compares the copies.
- **Revisit when:** a service needs a store the data layer cannot reach, or the data layer
  brands its ids and constrained strings itself, so the domain could take its schemas too.

### HTTP outside the modules

The HTTP groups, their handlers and the errors only HTTP raises (`RequestInvalidError` and the
upload's two) live in `apps/api`, outside the modules; `generateId` lives in `packages/db`,
beside the `id()` column.

- **Why:** a handler needs the assembled `Api`, which imports the groups, so a module owning its
  handler would make a cycle. No module raises them. `generateId` knows no app (a
  `Crypto` and a brand's `make` in, a UUIDv7 out), only services, use cases and handlers call it,
  and beside `id()` the id format lives in one file.
- **Sources:** departs from the guide's "Keep internal layering per module (API → domain →
  infrastructure)"
  ([styles/modular-monolith](https://software-architecture-guild.com/guide/architecture/styles/modular-monolith/));
  `.claude/rules/deep-modules.md`'s id generator given the brand's `make`.
- **Rejected:** `generateId` spelled out at each call, or copied per module: two copies of a rule
  no module owns. `generateId` in `kernel/data`: it knows no app, so it is a package's. A group
  in its module's `infrastructure/`, which no cycle forbids, as a group imports only `effect`,
  the domain and a sibling group: it would sit apart from its handler, and every process that
  imports the module, the worker too, would load the groups and `effect/http-api` (10 modules,
  27 KB more in the worker's bundle).
- **Cost:** a module's HTTP shape lives outside the module.
- **Guarded by:** the `apps/api` row of
  [architecture.md › Dependency rules](architecture.md#dependency-rules); no module's manifest
  declares `@app-template/api`, so an import of it fails TS2307.
- **If reversed:** a handler inside its module imports the assembled `Api`, which imports the
  module: a cycle `tsc -b` refuses.
- **Revisit when:** the groups stop being assembled into one `Api`, or a module serves its own
  HTTP surface.

### The API contract in the api

The api declares its HTTP surface in its own files, one group per entity beside its handler,
assembled into one `Api`, over the domain's schemas: ids, payload checks, models and errors are
the domain's own; every error gets its status where an endpoint or a middleware lists it
(`HttpApiSchema.status`); a wire shape that differs from its model is `<Model>.mapFields(…)`,
which omits fields by name or swaps them, named by an `identifier` so the snapshot holds it once,
and a mapper adds only what the model lacks (`buildApiChat` adds `status`). A field no client may
see stays out of the model: a failed Run's cause goes to the worker's log. Its unit test writes
`apps/api/openapi.json`; the web reads that file by path and keeps the client
`@effect/openapi-generator`'s command writes from it, checked in. Nothing of `application/`
reaches the browser, and the web declares no workspace of the app but `packages`.

- **Why:** a contract of its own declared each id, constrained string, status list and error a
  second time (23 twins of the domain's, 5 ids among them, with the tables' limits, patterns
  and enums' values copied into them), held in step by a test that compared only exports of one
  name, over a module list no check saw; the browser needs none of it, since its generated
  client imports only `effect`. A struct writes only its own fields, so `mapFields` keeps a
  field off the wire with no code, and the domain's error classes encode themselves, so no
  handler translates one and no class marker internal to Effect is relied on. A field kept for
  operators alone needs a wire shape for its model and for each model that nests it, while the
  log line that holds the cause carries the record's id.
- **Sources:** Effect's HTTP API guide, whose fixture group takes the domain's schemas
  (`repos/effect/ai-docs/src/51_http-server/fixtures/api/Users.ts`) and gives an error its
  status both on the domain's class
  (`repos/effect/ai-docs/src/51_http-server/fixtures/domain/UserErrors.ts`) and at an endpoint
  with `HttpApiSchema.status`; the api takes the second form only. The owner's decision of the
  design audit (Track B). A run of the derived contract against the twins' snapshot: the same 17
  operations, statuses and bodies. Departs from the guide's "design contracts around use cases,
  not around internal entity models"
  ([contracts](https://software-architecture-guild.com/guide/architecture/boundaries/contracts/)):
  the wire is the models' encoded side, held by the snapshot test. In the prototype of
  `docs/tickets/2026-11-04-1131_client-publishing/`, renaming a nested domain field on the wire
  broke 8 of 13 handlers without a mapper; here a renamed model field renames the wire field with
  no handler edit, and the api's snapshot test stops it.
- **Rejected:** the contract as a workspace importing only `effect`: the twins, a test to hold
  them, guards for a browser that no longer imports it. A status on the domain's class: an HTTP
  fact in a `domain/` the worker loads too. A status on the class only for an error HTTP alone
  raises: two forms for one fact. A constant per error with its status: a second name for one
  class, where `.claude/rules/deep-modules.md` spells a one-line expression at each use. A `pick`
  of the wire's fields: every field listed again. `Model.Class` variants: every domain class
  rewritten as a `Model`, whose select, insert and update variants restate the row the Drizzle
  table and the model as its row's codec already state ([Entity names](#entity-names)), and
  whose json variants are a second field list per model. A client generated at build time:
  typecheck, the bundle check and the editor would need a step first. The client held by a
  vitest file snapshot of the generator's output: 27 lines of test and `@effect/vitest` in the
  web, where the generator's command and `cmp` check the same. Track B had rejected that command,
  as the test called the same service and `bunx` wrote 33 lines apart on a fetched peer `effect`
  4.1.4; the installed command, run with `--no-install` over its peer pinned in the catalog,
  answers the second half. The web importing the api's `Api`: it would install the api and the
  modules. The api's tests on the web's generated client: they assert the domain's brands,
  `DateTime` and error classes. The snapshot in a folder below both apps: the api's test would
  write outside its workspace. A name per endpoint (`OpenApi.Identifier`): an operationId is
  unique across groups, so it repeats its group anyway. A translation per handler, an identity
  `buildApi<Model>`: `tsc` refuses the drift without them. The failure's cause kept on the Run
  for operators, as chat-core's D19 chose over the log alone: four wire shapes to keep it off
  the wire (the failure, the Run, the Run a message nests, the message), each inlined in the
  snapshot at every use, and two assertions that it stays off (`listMessages`, `getRun`).
- **Cost:** the web's client knows no brands, `DateTime`, `Option` or error classes (ids and
  dates are strings, an absent value `null`, an error a struct with `_tag`), and checks only
  what JSON Schema carries, so it can pass what the api refuses with a `400`: a text measured in
  code points where the api counts UTF-16 units, a rename's title the snapshot gives as a bare
  string; a media type's pattern, whose `i` flag JSON Schema lacks, is left out. A model's
  encoded side is its row's ([Entity names](#entity-names)), and the wire is that side under
  Effect's JSON codec: a row form changed for the store changes the wire too, unless the wire
  shape swaps the field. A field added to a model, a secret included, reaches the wire unless its
  wire shape omits it; the snapshot test stops it until `make api-snapshot` writes it into the
  diff, and only review of that diff refuses it. An error's status is spelled at each listing
  (25 for 13 errors), and a listing without `HttpApiSchema.status` answers `500`, which likewise
  only review of the snapshot diff refuses. A user's own group goes in `api.ts`'s first
  `.add(…)`, before `.middleware(Auth)`: past it, only a handler that reads `CurrentUser` fails
  `tsc`. The web's endpoints are `<group><Endpoint>`, the components follow the domain's classes
  (`UserEncoded`) and the wire shapes' identifiers (`ApiChat`), and a class answered through more
  than one schema, the bare class and each `.pipe(HttpApiSchema.status(…))` counting as one, gets
  a numbered component (`RunEncoded_2` for the Run's three). Two checked-in files move with every
  wire change, and the web keeps a generator, with its command's peer `@effect/platform-node`
  pinned. A failed reply's cause lives only in the worker's log (`assistant reply failed`,
  annotated with `runId`, `reason` and `cause`), as long as the log keeps it.
- **Guarded by:** `HttpApiBuilder` and `CurrentUser` under `tsc` (a field the wire adds that the
  model lacks fails `TS2322` at each handler that returns it, and a group past
  `.middleware(Auth)` whose handler reads `CurrentUser`, `TS377004`); the api's snapshot test;
  `make api-client-check`, which compares the client with what the generator's command writes
  from the snapshot (`make api-snapshot` rewrites both); the web's manifest, which declares
  `packages` alone, so an import of the app fails `TS2307`; the `apps/web/**` override;
  `make bundle-check`.
- **If reversed:** a workspace again restates the domain's ids, checks, models and errors with a
  test to compare them, and the web imports it instead of the generated client.
- **Revisit when:** the web needs a brand, a `DateTime`, an `Option` or an error class on its
  side; a client outside this repository needs the contract as code; a model's row form must
  differ from what the wire carries; or an operator needs a failure's cause past what the log
  keeps.

### Status owned by chat

`Status` belongs to `chat`.

- **Why:** only the chat and the Run use it.
- **Sources:** the ticket's survey of its users.
- **Rejected:** `Status` in a shared place: a vocabulary owned by no module.
- **Cost:** none today.
- **Guarded by:** another module reaches chat only through its entry and takes only the names of
  its contract, which review holds (`modules.md`).
- **If reversed:** a shared `Status` couples every module that reads it to chat's states.
- **Revisit when:** a second module's model needs a status.

### Records open, rules called

A module reads and writes any record through the data layer's repositories; a rule another
module owns is called through a use case, never copied, unless it is a rule of its own that only
looks alike. The test: if the owner changes the rule, must this module change too? Yes, one rule,
called; no, two rules, each kept by its module.

- **Why:** the data layer is every module's source of truth, its repositories open to all; a rule
  kept in one place changes in one place.
- **Sources:** departs from the guide's "one writer per dataset"
  ([styles/modular-monolith](https://software-architecture-guild.com/guide/architecture/styles/modular-monolith/));
  the guide's "Duplication is sometimes the cheapest way to stay decoupled"
  ([sharing](https://software-architecture-guild.com/guide/architecture/boundaries/sharing/)).
- **Rejected:** writes only through the owner's service: the repositories stay open to every
  module, as the data layer's are meant to be.
- **Cost:** a module may write another module's records past that module's rules (a user inserted
  without `ensure`), and no tool stops it.
- **Guarded by:** `.claude/rules/modules.md` refuses a copied rule; nothing refuses a write.
- **If reversed:** a Biome ban per entity subpath, or a review rule on writes, forces every write
  through its owner, and the flows that write two modules' records move into use cases.
- **Revisit when:** a write past an owner's rule causes a bug, or a module is to be extracted.

### Composition: wrap or compose

Every unit, a model's function, a domain service, a util or a use case, starts simple and keeps
the one job it was made for. A change edits a unit only to fix it or to extend that job; any
other change is a new unit that wraps it (the same interface, adding one responsibility around
its calls for every holder) or composes it (a new name built from it, for the callers that need
what it adds). A use case composes services, ports and model rules and holds only its flow.
Minimal means less code inside each unit and no dead code, never fewer units. The rule:
`.claude/rules/composition.md`.

- **Why:** a unit with one job has one reason to change, so a fix lands in one place and its
  tests stay its own; a new job added as a new unit leaves the tested units and their callers as
  they were. A composed unit's name says what it answers (the records as stored, or with their
  bytes), so a caller picks it by name. The plain `getMany` that hid the live check and the
  plain `delete` that hardcoded the unbound guard were rules edited into units named for records
  (the lesson in `roadmap.md`, entry 27); a Run's guarded write coded in two use cases was a step
  copied outside its service.
- **Sources:** the owner's principle (2026-11-19): wrap or compose, and change a unit only for a
  fix or an extension of its first intention, for models and utils as for services; Robert C.
  Martin, "each software module should have one and only one reason to change"
  ([The Single Responsibility Principle](https://blog.cleancoder.com/uncle-bob/2014/05/08/SingleReponsibilityPrinciple.html)),
  and "You should be able to extend the behavior of a system without having to modify that
  system"
  ([The Open Closed Principle](https://blog.cleancoder.com/uncle-bob/2014/05/12/TheOpenClosedPrinciple.html));
  Gamma et al., *Design Patterns* (1994): "Favor object composition over class inheritance", and
  the Decorator, also known as Wrapper; `repos/effect/LLMS.md`: "Build focused service layers,
  then compose them with `Layer.provide` and `Layer.provideMerge`".
- **Rejected:** folding a unit into another for its line count or its single caller: neither says
  anything of the job the unit holds, and the fold edits a tested unit for a job not its own. One
  service per model: one unit with several reasons to change. A flag or an option added to a unit
  for one caller: the unit then answers two callers.
- **Cost:** more units, files and layers, and longer provide lists; Gamma et al. name the price,
  "more objects (if fewer classes)". Whether a change extends a unit's job or adds another is
  judgement: review decides it, and the owner settles a dispute.
- **Guarded by:** review, by `.claude/rules/composition.md`, which `make review-rules` prints for
  every TypeScript diff; `noImportCycles` refuses a unit below that imports the one over it.
  Nothing refuses a fold.
- **If reversed:** a new job edits the unit nearest to it, and each unit's tests gain cases for
  jobs not its own.
- **Revisit when:** a chain of wraps over one unit grows so long that a caller cannot tell from the
  names which unit holds a rule; or two units change together in every change, so they hold one
  job, which the owner then merges.

### Rules as pure functions

A business rule is a pure function in its model's `.model` file, over the values passed in (the
time, the ids), built from small pieces of one condition or step each; a service, a use case or a
repository only reads, calls it and writes.

- **Why:** a pure piece is tested with plain values and no layer, and a new rule combines pieces
  that are already tested instead of repeating their logic; a service reads as reads and writes.
- **Sources:** `.claude/rules/layering.md › Ports and domain services`.
- **Rejected:** the check written inline in the service's body: only a layer over fakes tests it,
  and the next service that needs it copies it.
- **Cost:** more small exported names in a model; a combination keeps its name however few its
  callers ([Composition: wrap or compose](#composition-wrap-or-compose)).
- **Guarded by:** review, by `layering.md`; nothing mechanical.
- **If reversed:** the rules move back into the services' bodies, and their tests need layers.
- **Revisit when:** a model's pieces outgrow one file.

### One service per model

A model's records are served by one domain service, `<Model>Service`, the bytes it stores with
them included: the record as stored (`getOne`, a list) beside the reads and writes that hold the
bytes too (an upload, a download, the records whose bytes are stored, a bind, a delete).

- **Why:** the plain service under the bytes' one kept two methods only the upper one called,
  each a forward to the repository, one of them with a guard no caller reached, and a second
  entry in the provide list of the handler group that took both.
- **Sources:** `.claude/rules/deep-modules.md › The tests` (deletion).
- **Rejected:** `File<Model>Service` over the plain `<Model>Service`: two services for one model,
  and an exception to the line that a domain service never sees another one. A layer per rule
  between them (`Live<Model>Service`): shallow.
- **Cost:** one service answers the record as stored (`getOne`) and the records whose bytes are
  stored (`getMany`), so each method's TSDoc says which.
- **Guarded by:** review, by `layering.md`.
- **If reversed:** the byte methods move into `File<Model>Service` over the plain one, which
  provides it.
- **Revisit when:** a caller needs a model's records but never its bytes, so the store of the
  bytes is a dependency it does not use.

## The kernel and the data

### One kernel

One kernel workspace, `@app-template/kernel`, with one entry per part
([architecture.md › The three rings](architecture.md#the-three-rings) lists them), holds the data
and the boundary's configured clients and no service rule; `packages/*` is configurable and knows
no app.

- **Why:** the AWS inventory, the pinned images and the clients' wiring are one kind of code: this
  app's tools and data. One workspace keeps one manifest and one project.
- **Sources:** the guide's "Keep the kernel tiny" and "shared 'domain' utilities are treated as a
  smell"
  ([integration-of-bounded-contexts](https://software-architecture-guild.com/guide/architecture/domains/integration-of-bounded-contexts/),
  [styles/modular-monolith](https://software-architecture-guild.com/guide/architecture/styles/modular-monolith/)).
- **Rejected:** a package per kernel part: a manifest per part for one app's tools. `packages/aws`
  moved whole: the inventory, its naming rule and the provisioner moved to `kernel/aws`; the
  inventory's types and the dead-letter naming rule stay, imported by the kernel and by
  `deployment/aws/`.
- **Cost:** one manifest declares every client's dependency, so the linker no longer stops a
  module reaching a kernel part it does not use, and inside the kernel the data's direction rests
  on Biome, not on `tsc -b`. One entry per part opens a part whole, so the layers that may take
  only its inventory or its stores are held by the imported names (`*FromConfig`, `Db`).
- **Guarded by:** the kernel's, `packages/*`'s and `deployment`'s rows of
  [architecture.md › Dependency rules](architecture.md#dependency-rules), what their *Refused by*
  leaves to review held by `.claude/rules/modules.md`, which also refuses a service rule or a
  model in the kernel.
- **If reversed:** split into packages, the kernel's parts gain a manifest and a project each;
  with service rules in it, the kernel becomes the shared domain the guide calls a smell.
- **Revisit when:** a kernel part grows dependencies most modules must not reach; `/data` is the
  first candidate for a workspace of its own.

### The language model in the kernel

`kernel/llm` configures Anthropic's client (`AnthropicClientFromConfig`: the key of
`ANTHROPIC_API_KEY`, a 10-minute wait for a byte); `chat`'s `AssistantLlmFromConfig` builds its
two models over that client with `AnthropicLanguageModel.make`, each with its model of
`LLM_REPLY_MODEL` or `LLM_TITLE_MODEL` and its request settings, beside its prompts; its test
builds the adapter from those settings.

- **Why:** the kernel configures this client as it does Postgres (`PgClientFromConfig`), and the
  adapter, which holds Anthropic's request settings anyway, builds its models where it uses them.
  The two functions that stood between them, `createLanguageModel` in the kernel and
  `createLanguageModelAnthropic` in a package of its own, had one caller each and forwarded its
  arguments. The test takes the path the app takes.
- **Sources:** `docs/knowledge/ai.md`; the roadmap's `openai-provider` and `bedrock-provider`.
- **Rejected:** a builder in `kernel/llm` taking a purpose: its parameter was typed by Anthropic's
  request settings, so the adapter held one provider's settings all the same. A provider layer
  kept only for the test: an interface only a test uses. The test building the models itself: it
  would copy chat's settings and check its copy.
- **Cost:** chat's adapter names the provider's package, and `@effect/ai-anthropic` is a runtime
  dependency of the application workspace and of the kernel; a second provider changes both,
  its client layer in `kernel/llm` and its models in the adapter. No test checks the 10-minute
  wait, nor a request setting beside the model.
- **Guarded by:** the row of a module's `services/` in
  [architecture.md › Dependency rules](architecture.md#dependency-rules); the
  `AssistantLlmFromConfig` suite over a recording client.
- **If reversed:** a function between the adapter and the library comes back, and its signature
  carries the provider's request settings.
- **Revisit when:** a second provider lands.

### The data at the centre

`kernel/data` holds every store (tables, relations, the attachments' objects) and its
repositories in its own types, one `Db` over every table; it imports only `packages/*` and takes
its clients from the context. The tables stay in `public` with their foreign keys.

- **Why:** the data is the app's source of truth; one place declares every store, joins and
  foreign keys included, and every module reads what it needs, its domain the tables' limits,
  patterns and enum values, each declared once ([A module's layers](#a-modules-layers)).
- **Sources:** departs from the guide's "share a physical database, but not each other's tables"
  ([styles/modular-monolith](https://software-architecture-guild.com/guide/architecture/styles/modular-monolith/))
  and "The service that writes to a table owns that table"
  ([managing-operational-data](https://software-architecture-guild.com/guide/architecture/boundaries/managing-operational-data/)).
- **Rejected:** a Postgres schema and a typed Drizzle per module, no key across modules:
  boundaries on data the app reads as one. The tables, repositories and models together in the
  kernel: a shared domain, the guide's coupling magnet.
- **Cost:** most features change `kernel/data`; a table's value is the domain's too, so changing
  it changes the model's check; two modules may use one repository, so a change of its behaviour
  reaches both, held by the repository's e2e; a module can be extracted only with its stores
  carved out of the data layer.
- **Guarded by:** the `kernel/data` row of
  [architecture.md › Dependency rules](architecture.md#dependency-rules);
  `.claude/rules/modules.md` refuses a model or a service rule there; the repositories' e2e.
- **If reversed:** a schema and a Drizzle per module, one migration; every join and foreign key
  across modules becomes a read through the owner.
- **Revisit when:** a module is to be extracted, or two modules' data stop being read together.

### Entity names

The data layer's names end in `Entity` (`ChatEntity`, its `Where` and `Set`);
its repositories are `<Name>Repository`; a table lives in `<name>.table.ts`, its entities in
`<name>.entity.ts`. An entity is the shape every read returns, so `ChatEntity` and
`MessageEntity` nest their attachments. The domain's records are models, and a model is the
codec of its own row: its encoded side is the row of its one store, the rules read its type side
only, and its callers code its row with the generic `encodeRowWith` and `decodeRowWith`, with
no mapper per model. A second stored form of a model brings back a mapper that lays the model's
schemas over that store's columns.

- **Why:** a reader tells the data's view from the domain's by the name alone, and a table from its
  entity by the file; tables that import only tables leave the entities free to nest one another
  without an import cycle. A stored field is declared in the table and the model, which the wire
  takes as it is, with no third list in a mapper.
- **Sources:** the ticket's naming survey; `.claude/rules/naming.md`.
- **Rejected:** a flat entity beside a second one with its attachments: a second name for the one
  shape every read returns. The service composing a chat from two repositories: two queries and a
  grouping where one relational read serves. A mapper that lays the model's schemas over the
  columns (`<Model>FromEntity`): a second list of the model's fields. A mapper that only names
  the model's codec pair (`encode<Model>`, `decode<Model>`): a file and three names per model,
  each over one generic call.
- **Cost:** a store has two files where it had one. A model's declaration says how its row stores
  a value (`null`, a `Date`), and a column the model lacks is dropped by a read. Each call names
  its codec and the read's shape (`decodeRowWith(Schema.Option(<Model>))`), and a write encoded
  with the whole model instead of its `<Model>Fields` compiles and runs, encoding the nested
  records for nothing, since the insert takes only the table's columns.
- **Guarded by:** `.claude/rules/naming.md`; the `kernel/data/**` override keeps models out; the
  repository's `insert`, which takes the table's full row, so a column the model lacks or a model
  field its row cannot take fails typecheck at the service's insert.
- **If reversed:** a rename, and the tables back into the entity files, where nesting reads
  bring the import cycle back; each mapper lays the model's schemas over its columns again, and
  every call of a model's codec moves to its mapper, each named by `tsc` at its insert or read.
- **Revisit when:** a store needs a read shape other than its entity's.

### Checks kept in the tables

The tables keep their checks: the data layer declares the enums' values and the checks' limits
and patterns, and a model that holds one imports it to check the same rule on its side.

- **Why:** the database stays a guard against any writer, as the partial unique index already
  is.
- **Sources:** the guide's "Foreign keys, views, triggers, and logical invariants encode coupling
  between tables"
  ([managing-operational-data](https://software-architecture-guild.com/guide/architecture/boundaries/managing-operational-data/)).
- **Rejected:** the checks dropped, the rule only in the modules: the database would accept a
  row the app never writes.
- **Cost:** a rule lives twice, as a check and as a model's refinement, though each value once;
  the model's side may add to the check (trimming every whitespace, counting UTF-16 units),
  never accept less.
- **Guarded by:** the data layer exports each limit, pattern and enum's values from its table and
  a model that holds it imports it; the data layer's e2e check the table's side
  ([tooling.md › Tests](tooling.md#tests)); `make migration-check`.
- **If reversed:** a migration drops a check, and a writer past the services can store a row no
  model decodes.
- **Revisit when:** a rule cannot be a check, or a model needs a value its table cannot state.

### Guards in the write, no lock

A rule two writers could break between a read and a write is a guard in the write itself (a
partial unique index, an `UPDATE … WHERE` on the state read), and no read takes a lock. A write
over a list of ids dies unless it changes a row per distinct id, so the loser of a race writes
nothing and rolls back whole.

- **Why:** the checks run as pure functions over a plain read, before every write; a lock would
  tie the check to the transaction and hold rows while other work runs.
- **Sources:** [database.md › Guards](database.md#guards); `.claude/rules/layering.md ›
  Concurrency`.
- **Rejected:** a `FOR UPDATE` read before the check: the loser would wait and then get its
  domain error, but the read would carry an option that changes its contract. A deferrable key
  from an attachment to its message, to bind before the insert: a schema change for one order of
  writes.
- **Cost:** a loser that read before the winner committed dies with a `500`, not a typed refusal; a
  loser that reads after it gets its `409`.
- **Guarded by:** the repositories' writes die on a missed row, each with its e2e; the e2e race
  of two sends to one chat asserts one sent, one refused.
- **If reversed:** the reads take `forUpdate` again, and a check whose loser must get a domain
  error waits on the winner's commit.
- **Revisit when:** a race's `500` reaches users often enough to need its own refusal.

### Reads in creation order

A read of a chat's messages or of attachments answers them in creation order, `createdAt` then
`id`: the attachments of a message or of a send, whatever order the ids were asked in. The chat
list alone answers newest first. An error over a
list of ids, such as `AttachmentNotFoundError`'s `ids`, names each missing id once, in the order
asked.

- **Why:** one order for a chat's contents, written once, in each repository's `ORDER BY`; a send's
  message answers its attachments as a later read of the chat does.
- **Sources:** [database.md › Schema and entity files](database.md#schema-and-entity-files) (the
  index that serves it).
- **Rejected:** the order asked, kept by sorting the rows by the ids in the service: a second
  order for one read, lost again when the chat is read back.
- **Cost:** a client that sends `[b, a]` gets `[a, b]` back when `a` was uploaded first, and
  reorders them itself if it needs the order it asked.
- **Guarded by:** the repositories' e2e read rows created out of id order in creation order; the
  attachment model's unit test names the missing ids in the order asked.
- **If reversed:** the service sorts what the repository reads by the ids asked, and a chat read
  back still answers creation order.
- **Revisit when:** a client needs its attachments in an order it chooses.

### Status from the newest Run

A chat has no status column: the chat model's `buildChatStatus` derives it from the chat's newest
Run, which every read of a chat nests. Any other value another table implies is a column the
transactions that change it move (`.claude/rules/deep-modules.md › Composition over
pass-through`).

- **Why:** the Run holds the status already; a column would be its second copy, written by each
  of the Run's moves (its creation, a retry, `preparing`, `generating`, `done`, `failed`) in that
  move's transaction, and one forgotten write lets the two drift. The derived one costs no query,
  since the read nests the Run, and one pure function serves the api and the rules
  (`ensureChatNotBusy`); a client derives it the same way from the Run it reads.
- **Sources:** the owner's choice, in the Knowledge of
  [the reply-run lab](../tickets/2026-11-09-1206_reply-run/lab.md).
- **Rejected:** a `chats.status` column moved by every Run move: a write in each and a drift to
  keep a value that one row already gives.
- **Cost:** a query over chats by status joins each chat's newest Run, and a read that needs the
  status has to nest that Run.
- **Guarded by:** review, by `deep-modules.md`; nothing mechanical.
- **If reversed:** a migration adds the column, each Run move writes it in its transaction, and
  `buildChatStatus` moves from the reads to the writes.
- **Revisit when:** a read lists or filters chats by status, or reads a chat's status without its
  Run.

### Clients from the context

The data layer takes its clients from the context: `Db` needs `PgClient` and `FileRepository`
needs `S3Bucket`; `kernel/postgres` (`PgClientFromConfig`, the migrate entry) and `kernel/aws`
(`S3BucketFromConfig`) build them from config; the processes provide them, the data's e2e
`DbTest` and `AwsTest`.

- **Why:** the centre reads no configuration and names no connection; a test swaps a client by
  providing another layer.
- **Sources:** the ticket's design; `kernel/CLAUDE.md`.
- **Rejected:** `PgClientFromConfig` and the migrate entry in `kernel/data`: the centre would read
  the boundary's configuration.
- **Cost:** each process's `layer.ts` names every client; a missing one is a type error in the
  layer's requirements.
- **Guarded by:** the `kernel/data` and `use-cases` rows of
  [architecture.md › Dependency rules](architecture.md#dependency-rules); the layer's
  requirements in `tsc -b`.
- **If reversed:** the data layer builds its clients from `/config`, and every test of it needs
  the configuration of a real store.
- **Revisit when:** a store's client needs data-layer knowledge to be built.

### Files in the data layer

Files are `FileEntity` and `FileRepository` in the data layer, over the `S3Bucket` in the
context. A file is one entity read from its object's metadata, with its signed URL as a field;
only `download` reads the bytes, answering `DownloadedFileEntity`, the entity with them. The data
layer declares the key; `kernel/aws/resources` declares the bucket's name and lifecycle, which
`deployment` reads.

- **Why:** a consumer reads and writes through one kind of repository, whichever store holds the
  data; the objects stay in their bucket under their keys.
- **Sources:** the ticket's design; `docs/knowledge/aws.md`.
- **Rejected:** a bucket port in `chat` with an S3 adapter: a module's adapter over data every
  module may need. The bucket's name and lifecycle in the data layer: the name depends on the
  stage, a configuration the data does not read. A verb per signed URL: a caller then asks for
  presence through a URL, one call per file.
- **Cost:** one interface over a store that joins no transaction: the bytes are stored before the
  row that binds them and deleted once the rows are gone. Every read signs a URL, which sends no
  request.
- **Guarded by:** the repository's doc comment and `.claude/rules/layering.md` (the order); the
  api e2e of a refused chat delete; the file repository's e2e; the `deployment` row of
  [architecture.md › Dependency rules](architecture.md#dependency-rules).
- **If reversed:** the port goes back into `chat`'s `domain/` with its adapter in
  `infrastructure/`, and a second module needing files imports chat.
- **Revisit when:** `shared-files` or `assistant-files` needs files outside a chat.

### Jobs as queue messages

A job is a message on its queue, and no table holds it: the work it asks for keeps its own
record (the Run, the chat's title), which the worker reads to run it once, to settle a Run whose
worker died and to record a failure. `QueueSender.send` encodes the job by its
definition; a use case sends it after its commit, so every delivery finds its record. A send SQS
refuses that settles a record goes through the job's sender beside the use cases: the reply's
fails its Run, which the api answers `503 RunNotQueuedError`. One only logged, the title's, is
sent and logged in its use case.

- **Why:** every duty a job's row held already sits on the work's record; a row beside it is a
  second status for one piece of work. The send after the commit needs no relay and no sweep, and
  a missing record means a deleted chat. A refused send is the one cause of a stuck reply a
  handler can catch, so its Run fails at once and the user sees the failure with its retry; the
  reply's sender keeps that settlement out of the two use cases that send it, and the use cases'
  level already holds the queue and a status write through the repository.
- **Sources:** the ticket's review of what each reader of `jobs` used it for.
- **Rejected:** a table of jobs in the data layer, a row per job beside its work's record: a second
  status for one piece of work, written in the same transaction. The send last inside the
  transaction: SQS may deliver it before the commit shows the record, and the worker skips it as a
  deleted chat's, leaving the reply queued. A send that cannot be interrupted: it covers a
  client's abort only. A stuck Run that a retry may take after an age: a rule by time, and a Run
  that reads queued while it is lost. The sender in the module beside the definitions: a domain
  service would see the queue, and a send could run inside a transaction. A sweep resending
  unsent work: a schedule and a route of its own, and a reply up to a minute late. Retries with a
  delay per attempt: a failed reply the user waits on through every attempt, and code that counts
  them. A sender for every job, the title's included: a function with one caller around a send
  that changes no record.
- **Cost:** a process that dies between the commit and the send, or a client that aborts there,
  leaves the Run queued and its chat busy ([roadmap.md › Later](roadmap.md#later)); a refused
  send answers `503` for a stored message, which a reload shows with its failed Run.
- **Guarded by:** the `QueueSender` e2e; the reply sender's and the create flow's unit tests;
  the `use-cases` row of [architecture.md › Dependency rules](architecture.md#dependency-rules).
- **If reversed:** a table of jobs and its repository in the data layer, and a sender over both.
- **Revisit when:** the logs show replies stuck by a process that died before its send.

### One initial migration

Until a deployed database holds data, the schema is one migration, `init`: a change to a table
regenerates it, and every local database is recreated
([database.md › Migrations](database.md#migrations)).

- **Why:** the app is not in production, so no deployed row needs a migration path; one migration
  reads as the schema.
- **Sources:** `docs/knowledge/database.md`.
- **Rejected:** a migration per change before production: a history no deployed database needs.
- **Cost:** every schema change recreates each local database, losing its rows; two branches
  that both changed a table meet as two `init` folders, regenerated once more.
- **Guarded by:** `make migration-check` (the data layer matches the migrations).
- **If reversed:** nothing to undo; once the app is in production, every change is a migration
  again.
- **Revisit when:** the app reaches production: restarting the migrations is then forbidden.

## Guards, tests and the workflow

### Guards are configuration

The guards are `exports`, the isolated linker, `tsc -b`, Biome with its GritQL plugin and the
bundle check, which reads the web build's metafile against the packages the web's manifest lists
in `browserPackages`; what no configuration expresses are the review rules `.claude/rules/modules.md`
and, for a handler, `layering.md`, never hand-written test code. Each import rule is held once,
by the guard that can see it: the linker and `tsc -b` see a workspace but no unit inside a
folder, since `kernel/`, `packages/` and `application/` are one workspace and one
`tsconfig.json` project each; `.misc/lint/biome.base.json` has one override per layer, never
per unit, and the plugin reads the unit and the ring from the file's path. Which guard refuses
what:
[architecture.md › Dependency rules](architecture.md#dependency-rules) and
[Boundary guards](architecture.md#boundary-guards).

- **Why:** every guard is configuration of a tool the repo has; a fitness test is code to keep,
  and drifts. A list per unit repeated what the linker already refused and grew past what a
  reader checks whole; a rule held once, by the one tool that can, stays read. Biome's message
  names its record, which TS2307 never could, so it keeps the boundaries whose breach is
  costly: the browser's, the kernel's boundary in a service, the data layer.
- **Sources:** the guide's "Add fitness functions in CI … turn violations into failing builds"
  ([styles/modular-monolith](https://software-architecture-guild.com/guide/architecture/styles/modular-monolith/));
  in modular-monolith-with-ddd an architecture test checks the wrong assembly (research); Biome's
  GritQL plugins, which read `$filename`.
- **Rejected:** a module-graph test: test code for a rule review can hold. dependency-cruiser: it
  needs a TypeScript parser the repo lacks. A list per unit, `@app-template/**` refused but for
  each unit below it: an override per unit and per test folder, since Biome replaces an earlier
  override's options instead of merging them, most of them repeating TS2307. A `tsconfig.json`
  project per unit beside a list: its `references` would repeat the list, one rule in two places.
- **Cost:** what only review refuses, the lists in `modules.md` and `layering.md`, passes
  `make check` when review misses it; `noImportCycles` refuses a unit importing one above it only
  where a cycle of value imports forms, and `make test-unit` e2e support in a unit test only where
  the test builds it, since it starts no database. A refusal by TS2307 names no record. `tsc -b` no
  longer refuses a cycle between the units of one folder (TS6202). Grit gives the plugin only the
  absolute path, so it names the unit by the last `application/`, `kernel/` or `packages/` folder on
  it: a folder of that name inside a unit misreads its files, and a checkout under one
  (`~/packages/<repo>/`) misreads every file outside the three folders, refusing an app's own
  `#<app>/…`; the rules of the apps and `deployment` read the last ring folder on it the same way.
- **Guarded by:** `make check` runs them all; the Standards reviewer reads the rules that bind
  the diff (`make review-rules`); `.misc/lint/biome.base.json` and its GritQL plugins beside
  it, `biome-imports.grit` for the imports and `biome-effect.grit` for the Effect style a
  type-blind reader can see; the Effect language service's `overrides` in `tsconfig.base.json`,
  for the ambient globals `application/` bans.
- **If reversed:** a test beside the rule, kept in step with every new module; a list per unit
  again, or a folder split into a workspace per unit
  ([Imports through subpaths](#imports-through-subpaths)), its dependencies in place of the lists.
- **Revisit when:** review misses a violation the rule names, or a tool gains the check.

### Imports through subpaths

A file imports its own unit's files through the workspace's `#…` subpaths, never a relative path,
and another unit only through that unit's entry, even inside one workspace. A unit of the
kernel, of `packages/` or of `application/` is imported by its folder: each of the three folders
is one workspace with one export per unit, its `index.ts`, and its test support. The apps keep
their package names. The forms, with examples:
[architecture.md › Imports](architecture.md#imports-workspace-vs-app-template).

- **Why:** an import tells where its code lives, and one entry per unit is all a caller must know;
  a subpath inside a workspace names the unit and the layer it reaches, so a Biome override can
  refuse it by pattern, while a relative path hides the layer and can reach into another
  workspace's files.
- **Sources:** `.claude/rules/naming.md`; npm names allow one `/` after the scope, so a folder's
  path is a subpath of its folder's workspace; `tsc -b`'s TS6059 and TS6307 on a path into an
  unreferenced project.
- **Rejected:** relative paths inside a layer only: one more rule for a reader to apply, and no
  pattern tells a layer's own folder from the next. A workspace per unit with `paths` aliases
  in `tsconfig.base.json`: an alias bypasses the linker entirely and needs a setting in every
  tool. A subpath per store or per layer (`/data/<store>`, `/chat/domain`): a caller must know
  the unit's inside. A `tsconfig.json` project per module: its `references` would repeat the
  Biome overrides, one rule in two places.
- **Cost:** every workspace declares its `imports`; one manifest declares every unit's
  dependencies, so the linker tells the folders apart but not one unit from another; a unit's
  one entry opens it whole, so a layer that may take only part of it (the inventory of `/aws`,
  the stores of `/data`, a module's contract) is held by the names it imports; `application/`
  and `packages/` are one `tsconfig.json` project each, as the kernel is, so `tsc -b` no longer
  refuses an import between their units ([Guards are configuration](#guards-are-configuration)
  says what does).
- **Guarded by:** `biome-imports.grit` and the overrides' `importNamePattern`, in the forms
  [architecture.md › Boundary guards](architecture.md#boundary-guards) lists.
- **If reversed:** a folder splits into a workspace per unit, each with its manifest, and the
  specifiers lose the folder; without the `#…` subpaths, the per-layer overrides no longer see
  which layer a relative import reaches.
- **Revisit when:** Biome can restrict an import by the folder it resolves to.

### Independent apps

`apps/api`, `apps/worker` and `apps/web` never import each other or `deployment`; what two apps
share lives in a ring below them, and the web reads the api's OpenAPI snapshot by path, a file,
never code.

- **Why:** each app is one process with its own deployment; an import between them ships one
  process's code and dependencies inside another.
- **Sources:** `apps/CLAUDE.md`; `deployment/aws` deploys the worker as a function of its own.
- **Rejected:** a shared helper in one app imported by another: it couples their releases.
- **Cost:** a helper both processes need moves down into a module, the kernel or a package; the
  web takes the api's wire only as a file, so its client is generated from the snapshot and
  checked in.
- **Guarded by:** the apps' rows of
  [architecture.md › Dependency rules](architecture.md#dependency-rules); the journey e2e that
  runs both processes lives in the `apps/e2e` test app.
- **If reversed:** a process pulls the other's dependencies and layer, and an app can no longer
  be deployed alone.
- **Revisit when:** two apps merge into one process.

### Tests in their folders

Every workspace keeps its unit tests in `__tests__/` and its e2e in `__e2e__/`, each kernel part
as a package does. `application` has unit tests alone; its e2e, through the api, live in the
test app `apps/e2e`. Test support lives with the unit that uses it. The layout, the entries and
what a test may import: [tooling.md › Tests](tooling.md#tests).

- **Why:** the folder tells a unit test from an e2e and from source; a test sits beside what it
  checks: the behaviour runs over mocks of the stores, the real stores are tested in the kernel, the
  flow a user starts through the api. A part's tests and support sit with the part they test or
  build, as a package's do.
- **Sources:** `.claude/rules/effect-tests.md`; `vitest.config.ts` selects by folder; the
  owner's answer to the design audit's Q1 (2026-11-18): a unit test replaces everything external,
  and what Postgres accepts, refuses, races or rolls back is checked by e2e on the repository.
- **Rejected:** test folders at a workspace's top: support beside the source folders. The kernel's
  tests in one pair of test folders at its top: a part's tests away from it, and one support barrel
  for every part. Every package's support in `packages/testing`: a package's own harness away from
  it, behind a barrel every unit imports. The use cases' e2e in `application`, a use case called on
  Postgres: a call, not the flow a user starts. The e2e in each app: the journey would make the api
  import the worker, and apps never import each other. The e2e workspace at the root: a test of the
  processes away from them. The workspace as an `__e2e__/` folder in `apps/`: such a folder
  everywhere else holds the e2e of its own folder's source. The e2e support in `__e2e__/testing/`,
  exported under a name of its own: a third test folder, and an import name no folder carries. A
  label in the file name (`<name>.e2e-layer.ts`) beside the unit test support: the label is lost
  behind the `/testing` entry, which every unit test may import. The behaviour's suites on the
  per-test Postgres: `make test-unit` would need Docker. Memory repositories in place of the mocks:
  a second store, kept in step with Postgres by hand.
- **Cost:** a use case's race or rollback runs through the api with both processes up, slower than a
  call of the use case. A unit test sees no store: a mock answers what its case gives, so a case
  passes on a row Postgres would refuse, and each rule the database enforces needs its own case on
  the repository's e2e. The kernel declares an alias per part's support, and an export where another
  unit reads it. The run's `globalSetup` sits in the data's e2e support, though it starts the
  MiniStack every workspace's e2e uses. No tool refuses an import of e2e support a unit test never
  builds, nor test support in source: review does.
- **Guarded by:** `make test-unit`: its vitest project has no `globalSetup`, so a unit test that
  builds e2e support finds no database and fails; `.claude/rules/modules.md` refuses e2e support
  in a unit test and test support in source; the vitest projects include by folder and suffix.
- **If reversed:** a rename of the folders.
- **Revisit when:** a workspace needs a third kind of test.

### Tests keep their cases

A restructuring keeps every test case and assertion; it changes paths, the arrange and read steps
that go through a changed interface, and the setup of a moved client.

- **Why:** an unchanged case is the proof that behaviour was kept.
- **Sources:** the ticket's requirement that behaviour seen from outside does not change.
- **Rejected:** rewriting the suites with the code: nothing would show what changed.
- **Cost:** a suite moved onto another double rewrites its arrange and read steps.
- **Guarded by:** review of each step's test diff; nothing in `make check`.
- **If reversed:** a refactor can drop a case with no one noticing.
- **Revisit when:** a case tests an interface that no longer exists, not a behaviour.

### Leaf doubles without a contract suite

The three leaf doubles, `recordAssistant` for `Assistant`, `recordMessages` for `QueueSender` and
`FileRepositoryTest` for `FileRepository`, have no contract suite: no set of cases runs on both
a double and the port's real layer.

- **Why:** a suite run on a double tests test support, which `.claude/rules/effect-tests.md`
  › What to test refuses; each of the three ports has one real layer.
- **Sources:** Andrew Trenk and Dillon Bly, "Test Doubles", chapter 13 of *Software Engineering
  at Google* (2020), asks for a fake's own tests run against the real implementation; this record
  departs from it.
- **Rejected:** one suite per port, run on the double and on the real layer: a test of test
  support.
- **Cost:** a double can drift from its real layer unseen. One drift stands: `recordMessages`
  keeps the message as given, while `QueueSender.layer` encodes it by its definition's schema,
  so a unit test passes a message the real sender cannot encode.
- **Guarded by:** review alone; nothing compares a double with its real layer.
- **If reversed:** each port gains a suite of cases run on both, and the rule line against testing
  test support gets an exception.
- **Revisit when:** a drift of a leaf double hides a defect (a unit test green on what the real
  layer refuses), or `Assistant` gets a second real layer.

### Decisions recorded in one page

The decisions live here; `CLAUDE.md` points to it, and every Biome message and review rule names
its record.

- **Why:** a session about to change a boundary reads why it exists first.
- **Sources:** `CLAUDE.md` bans `docs/adr/`.
- **Rejected:** `docs/adr/`: banned. The decisions only in the tickets: a session would have to
  know which ticket made a rule.
- **Cost:** each decision is written twice: in its ticket as history, here as the binding rule.
- **Guarded by:** `make doc-lint` (every backticked repo path exists); review against
  `.claude/rules/claude-md.md`. A ticket id is refused in a code comment by
  `.claude/rules/comments.md` and in an instruction file by `.claude/rules/claude-md.md`, by
  review alone: the user wants no check for it.
- **If reversed:** the decisions go back to the tickets, and the pointer in `CLAUDE.md` goes.
- **Revisit when:** the records outgrow one page.

### Instructions name patterns

An instruction file, a `CLAUDE.md`, a rule, a skill or an agent, names a pattern with placeholders
(`<module>/<name>.ts`), a package specifier or the doc that owns a fact, never a source file.

- **Why:** a refactor that keeps every constraint should need no doc edit; on the branch that cut
  the modules, every `CLAUDE.md` edit was a path rename, never a changed constraint. Source files
  are the instances that move, and Claude reads an instruction file in every session it matches,
  so a stale path there misleads the most.
- **Sources:** `.claude/rules/claude-md.md` (the pattern, not the instance); the audit of
  [the ticket that made this record](../tickets/2026-11-02-1820_lean-instructions/feature.md).
- **Rejected:** a separate check with allowed prefixes and a depth limit: four heuristics for the
  few source paths the files then named. An allowlist of names: itself a copy that goes stale.
- **Cost:** a bare file name or a folder (`shared/`) passes until it goes stale; `make doc-lint`
  then fails on it only where it starts at a top-level folder of the repo.
- **Guarded by:** `make doc-lint`, which fails on a source path in an instruction file whether
  the file exists or not (what counts as one: the comments of
  `.misc/lint/markdownlint-cli2.mjs`), and on a rule whose `paths:` filter matches no file,
  since a rename can stop a rule loading unseen.
- **If reversed:** drop the `source-path` rule of the doc lint; a source path is then checked
  only for existing, so a moved file's line is caught but its rename still forces a doc edit.
- **Revisit when:** an instruction file must name a source file no pattern describes.

### Instructions within size limits

A `CLAUDE.md` and a rule each have a line limit; the numbers live only in the limits line of
`.claude/rules/claude-md.md`, which `make doc-lint` reads.

- **Why:** a `CLAUDE.md` or a rule is paid for in every session it matches, and files grow by
  appending: rules sat at or over the limit while the limits were advice that nothing checked.
  A hard limit makes the next fix cut a line instead of adding one.
- **Sources:** `.claude/rules/claude-md.md` (the test a line must pass, the limits); the audit of
  [the ticket that made this record](../tickets/2026-11-02-1820_lean-instructions/feature.md).
- **Rejected:** the numbers in the doc lint's config, the rule pointing to them: a reader of the
  rule must open the config to learn a limit. Soft limits ("about" a number): nothing refuses them.
- **Cost:** the check depends on one line's shape, so a reworded limits line makes it exit 2,
  naming the line it expects; a file at its limit takes no line without giving one up.
- **Guarded by:** `make doc-lint`, which fails on a file over its limit, naming file and length.
- **If reversed:** drop the `over-limit` rule of the doc lint; the limits go back to advice.
- **Revisit when:** a constraint that passes the test of `claude-md.md` no longer fits its file
  after every other line has been cut.

### Rounds by commit

Every round of a ticket's step is a commit of one unit
(`.claude/rules/commits.md › A commit's unit`), named by its stage, step, round and source
(`.claude/rules/rounds.md`), committed by the implementer, or by the main session for its own and the
user's rounds, as soon as `make check` is green and before the user reads it; the user's own edits,
found between rounds, are a round of their own, and no commit the user has seen is rewritten
before the PR.

- **Why:** the user reviews by commit. A change made over an uncommitted round, by an agent or by
  hand, cannot be told apart from the round afterwards, so the user re-reads the whole step to
  find what moved. A subject that opens with the round's id and source, and a fix's body that
  opens with the round it fixes, show in `git log --oneline` where a change belongs, who asked for
  it and what it corrects. Committing before reading costs nothing on `main`, which takes the
  ticket as one squash.
- **Sources:** `.claude/rules/sdd.md › Gates` (the rounds and the commit gate);
  [the ticket that made this record](../tickets/2026-11-07-1232_sdd-stages/feature.md).
- **Rejected:** the kind of change in the brackets (`FIX`): it repeats the gitmoji and type and
  leaves the source unnamed. The fixed commit's hash in a fix's body: it goes stale after a
  cherry-pick. A review of the uncommitted step: the user's edits over it mix with the round. The
  user's edits folded into the next agent round: that round's diff is no longer the agent's. One
  commit per run of the implementer, made by the main session: a step's independent parts land
  in one diff, which the reader cannot judge part by part.
- **Cost:** more commits on the branch, a revert of rejected rounds among them; a subject longer
  by the id, which counts apart from its 50 characters; a commit takes 1.3 s for docs and 2.5 s
  for code with the pre-commit hook. Every reader of the step's diff reads a committed range
  (`make review-rules BASE=<base>`, the parallel steps' pick, the claimed finding's worktree), and
  `git revert` is allowed by `.claude/settings.json`. The branch's last rounds revert together
  in one commit while nothing after them rests on them; a rejection after later work rests on a
  round fixes forward, since a revert there would pull the base from under that work.
- **Guarded by:** review against `.claude/rules/rounds.md` and `.claude/rules/sdd.md`; nothing
  checks a subject's id.
- **If reversed:** one commit in `rounds.md`, `sdd.md` and `/ticket-implement` brings back one
  commit per reviewed step; a written history keeps its names.
- **Revisit when:** a ticket's history is read by its PR alone, or the rounds' count makes
  `git log --oneline` of a branch harder to read than its steps.

### Plans in stages

A ticket's plan holds every step as a skeleton, with its outcome and coverage, and writes the low
level, a stage design and its steps in full, one stage of about three steps at a time, after the
facts those steps rest on are checked. Each stage closes with a review of its diff and, when due,
a verification of what it built (`.claude/rules/sdd.md › Gates`).

- **Why:** the low level written before its facts goes stale. An audit of 21 tickets found
  late-step detail edited after approval in 6 of the 9 with history: 4 to 8 of the 10 steps after
  the third, with edits reaching up to 8 steps ahead. What held was the step list, each step's
  outcome and the architecture's decisions, which the skeleton keeps; so the heavy review lands
  on the skeleton and the first stage, and each later stage is checked when prepared and
  reviewed when it closes. Three commits skip the user's OK, so a loop crosses a boundary
  without stopping: a stage's facts, which land before its triage so a compaction or a question
  round loses none; a preparation that asks the user nothing; and a stage verification's section
  when no failure in it needs a requirement changed.
- **Sources:** `.claude/skills/ticket-plan/stage.md` (the preparation), the stage close of
  `.claude/skills/ticket-implement/SKILL.md` and the stage mode of
  `.claude/skills/ticket-verify/SKILL.md`;
  [the ticket that made this record](../tickets/2026-11-07-1232_sdd-stages/feature.md).
- **Rejected:** the whole plan detailed and approved up front: the stale detail above. Each stage
  approved by the user: an independent critic counted 8 to 14 approvals per ticket and a loop
  stopping every three steps. A review pass of its own for a stage: the Design pass, given the
  architecture, the skeleton and the stage design, already reads the stage's shape.
- **Cost:** the user sees a later stage only as its commits, unless its preparation asks; each
  close runs `simplify` and two reviewers over the stage's diff, and a verifier every second
  close or after a change to a contract or the architecture; a plan grows by a section per stage.
- **Guarded by:** a stage's steps get their sections only from its preparation, and
  `/ticket-implement` runs no step without one, naming `/ticket-plan <ticket> next` instead;
  review against `.claude/rules/sdd.md`.
- **If reversed:** one commit brings back the plan detailed whole under one review and drops the
  stage close; plans written in stages stay readable, and a plan without stage headings already
  runs as one.
- **Revisit when:** the first two tickets planned in stages, `lambda-processes` and
  `telemetry-minimal`, have reported their per-stage tables.
