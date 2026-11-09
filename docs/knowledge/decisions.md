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

The behaviour is split by business capability, `chat` and `identity` under `application/`;
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

```ts
// two modules' services, each reading for its own module's rule, under one transaction
const place = Effect.fn('PlaceOrderUseCase.place')(function* (
  customerId: CustomerId,
  lines: OrderLines,
) {
  yield* customers.requireActive(customerId)
  return yield* orders.place(customerId, lines)
}, transaction.run)
```

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
- **If reversed:** a consumer that takes the module's entry reaches its services and data
  mappers, and two modules can depend on each other with no tool noticing.
- **Revisit when:** a second consumer needs more of a module than its contract holds: grow the
  contract, never import past it.

### A module's layers

A module holds `domain/`, `services/` and, once it has an adapter, `infrastructure/`, behind one
entry, its `index.ts`, which re-exports every layer; its files reach each other through aliases
that name the module (`#<module>/domain/*`). A repository is no port: a service
calls the data layer's repository directly.

- **Why:** `domain/` holds the rules as pure functions over values passed in, so what reads the
  data cannot sit there. Nothing of it reaches the browser any more
  ([The API contract on its own](#the-api-contract-on-its-own)), so it takes from the data layer
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
  A leaf package of shared values for the data layer, the domain and the API contract: the
  contract would import a workspace ([The API contract on its own](#the-api-contract-on-its-own)).
  The domain's own copies kept: a value could drift between the two declarations.
- **Cost:** a service depends on the data layer directly, so its unit tests take the data layer's
  memory repositories; the domain loads the data layer's entry, and its guard admits of it only
  the names of a value's shape, so a value of a new shape widens the guard's pattern; one entry
  opens the module whole, so another unit's ban on a layer matches the names it imports. A
  layer's override covers its tests, so what they need passes in its source too. What passes
  every guard: [architecture.md › Known gaps](architecture.md#known-gaps).
- **Guarded by:** one Biome override per layer, matching every module by glob and covering the
  layer's tests, the domain's admitting of the kernel only `@app-template/kernel/data`, and of
  it only a value's name (`<name>Pattern`, `<name>Statuses`): the rows of a module's layers and
  of `http-api` in [architecture.md › Dependency rules](architecture.md#dependency-rules); `make bundle-check`,
  which reads the web bundle's metafile and refuses the module's package in it;
  `.claude/rules/layering.md`, a repository, a mapper or the data layer in an app's handler.
- **If reversed:** a port per repository comes back with an adapter each that only delegates; an
  export per layer brings back the subpaths and a ban per layer by path; a domain without the
  data layer declares each value again, and a mapper's unit test per value compares the copies.
- **Revisit when:** a service needs a store the data layer cannot reach, or the data layer
  brands its ids and constrained strings itself, so the domain could take its schemas too.

### HTTP outside the modules

The HTTP groups stay in `http-api` and the handlers in the apps; `RequestInvalidError` stays in
`http-api`; `generateId` lives in `packages/db`, beside the `id()` column.

- **Why:** a handler needs the assembled `Api`, which imports the groups, so a module owning its
  handler would make a cycle. No module raises `RequestInvalidError`. `generateId` knows no app (a
  `Crypto` and a brand's `make` in, a UUIDv7 out), only services, use cases and handlers call it,
  and beside `id()` the id format lives in one file.
- **Sources:** departs from the guide's "Keep internal layering per module (API → domain →
  infrastructure)"
  ([styles/modular-monolith](https://software-architecture-guild.com/guide/architecture/styles/modular-monolith/));
  `.claude/rules/deep-modules.md`'s id maker given the brand.
- **Rejected:** `generateId` spelled out at each call, or copied per module: two copies of a rule
  no module owns. `generateId` in `kernel/data`: it knows no app, so it is a package's.
- **Cost:** a module's HTTP shape lives outside the module.
- **Guarded by:** the `http-api` and `apps/web` rows of
  [architecture.md › Dependency rules](architecture.md#dependency-rules); `make bundle-check`.
- **If reversed:** a handler inside its module imports the assembled `Api`, which imports the
  module: a cycle `tsc -b` refuses.
- **Revisit when:** the groups stop being assembled into one `Api`, or a module serves its own
  HTTP surface.

### The API contract on its own

`http-api` declares the wire itself and imports only `effect`: every id, constrained string,
status list and error restates the domain's under the same name, a model's wire shape is an
`Api<Model>` `Schema.Struct`, and an error carries its status on the class. The api implements
it, handing it the domain's models through one `buildApi<Model>` per response model and the
domain's errors as they are; the web calls it. Nothing of `application/` reaches the browser.

- **Why:** the web's freedom from server code rested on tree shaking, which a lost side-effects
  flag undoes in one build; the backend kept rules for the web's sake, and the bundle check was
  rewritten on every rename. A contract of its own closes the only path from the browser into
  the app. A struct encodes any object that has its fields and writes only them, so an internal
  field stays off the wire with no code, and the contract's error class encodes the domain's
  instance by the class marker Effect puts on it, so no handler translates an error.
- **Sources:** the guide's "design contracts around use cases, not around internal entity
  models"
  ([contracts](https://software-architecture-guild.com/guide/architecture/boundaries/contracts/));
  the prototype of `docs/tickets/2026-11-04-1131_client-publishing/`, where renaming a nested
  domain field on the wire broke 8 of 13 handlers without a mapper.
- **Rejected:** the contract's DTOs as `mapFields` over the domain's schemas: the browser bundle
  holds whatever the bundler fails to drop, and the domain must stay browser-safe for it. A
  client generated from `openapi.json`: it loses `Option`, `DateTime` and the error classes, and
  adds a generator to keep. A module `contract/` that ships to the browser: every module would
  carry the browser's constraints, and the web would import `application/`. A translation per
  handler from a domain error to the contract's: a place per handler for the wire to drift.
- **Cost:** every id, constrained string, status list and error is declared twice, in the domain
  and in the contract, held in step by the twins test only under one name; a wire field costs a
  line more; `openapi.json`'s component names follow the contract's identifiers. The class
  marker is internal to Effect, so an upgrade that drops it turns every domain error into a
  `500`.
- **Guarded by:** the `http-api/**` override, an allow-list that refuses every import but
  `effect`, `effect/<module>` and the contract's own `#http-api/…` files; `"types": []` in its
  `tsconfig.json`, so a `Bun` or `process` global fails `tsc`; the api's twins test, which
  compares each contract schema with the domain export of the same name by its representation
  and encodes a domain error through the contract's class; the `buildApi<Model>` mappers and
  `CurrentUser` under `tsc`, where a brand, tag, literal or field drifted on one side no longer
  typechecks; `make bundle-check`.
- **If reversed:** the contract imports the modules again, the web bundle holds whatever the
  bundler fails to drop, and the domain must stay browser-safe; one commit per group, back to
  `mapFields` over the domain.
- **Revisit when:** a second consumer of the contract appears, or a client generated from it
  replaces `ApiClient`.

### Status owned by chat

`Status` belongs to `chat`.

- **Why:** only the chat and the message use it.
- **Sources:** the ticket's survey of its users.
- **Rejected:** `Status` in a shared place: a vocabulary owned by no module.
- **Cost:** none today.
- **Guarded by:** another module reaches chat only through its entry and takes only the names of
  its contract, which review holds (`modules.md`).
- **If reversed:** a shared `Status` couples every module that reads it to chat's states.
- **Revisit when:** `jobs` adds statuses: it gets a job vocabulary of its own.

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

### Rules as pure functions

A business rule is a pure function in its model's `.model` file, over the values passed in (the
time, the ids), built from small pieces of one condition or step each; a service, a use case or a
repository only reads, calls it and writes.

- **Why:** a pure piece is tested with plain values and no layer, and a new rule combines pieces
  that are already tested instead of repeating their logic; a service reads as reads and writes.
- **Sources:** `.claude/rules/layering.md › Ports and domain services`.
- **Rejected:** the check written inline in the service's body: only a layer over fakes tests it,
  and the next service that needs it copies it.
- **Cost:** more small exported names in a model, and a one-caller combination stays a name of
  its own when it makes the service read as one step.
- **Guarded by:** review, by `layering.md`; nothing mechanical.
- **If reversed:** the rules move back into the services' bodies, and their tests need layers.
- **Revisit when:** a model's pieces outgrow one file, or a combination is never reused.

### Layered services of one model

A model's records may be served by domain services layered over each other, each named for what
it adds: `<Model>Service` holds the plain records (a read by key with its `*NotFoundError`, a
read of many, a delete of many under the full `where` its caller passes), `Live<Model>Service`
over it applies the model's rule to the same reads, and `File<Model>Service` over the live one
stores, serves and removes the bytes with the record, checking the rule a delete needs and
passing its guard into the plain delete's `where`. A layer sees only the layers of its own model
below it; another model's service stays a use case's.

```ts
// the rule's layer reads through the plain one and pipes the model's guard
const getOne = Effect.fn('LiveOrderService.getOne')(function* (where: OrderWhere) {
  const now = yield* DateTime.now
  return yield* orders.getOne(where).pipe(ensureOpen(now))
})
```

- **Why:** a read's name says what it answers. One `getMany` that dropped the expired
  attachments without a word taught its reader the rule from the source; the plain service
  answers the records as stored, the live one says in its name that the expired read as absent,
  and the bytes are stored and removed with their record in one service.
- **Sources:** `.claude/rules/layering.md › Ports and domain services`;
  `.claude/rules/deep-modules.md › The tests` (a name per variation is the last resort).
- **Rejected:** one service with the rule in its method names (`getOneLive` beside `getOne`):
  two reads per verb on one interface, doubling with each rule. The rule piped onto the plain
  `getMany` by each caller (`getMany(where).pipe(ensureAllLive(ids, now))`): every caller
  repeats the clock read and the pipe, and one that forgets it treats an expired attachment as
  usable.
- **Cost:** it breaks the line that a domain service never sees another one, and the line that a
  domain service's `layer` leaves every dependency open: a layer provides the one below it. Three
  services and three layers for one model; a handler of the model takes two of them; the rule's
  layer is shallow, two reads over the plain ones; the plain `getMany` leaves an absent id out,
  so only the live layer's error names every absent and expired id at once.
- **Guarded by:** review, by `layering.md`; `noImportCycles` refuses a lower layer that imports
  an upper one; nothing refuses a service of another model.
- **If reversed:** the live and file methods fold back into one `<Model>Service` that applies
  the rule in every read, and a caller that needs the plain record reads the repository.
- **Revisit when:** a model needs a second rule over the same reads, so the layers would
  multiply per combination, or a layer is left with one caller.

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
  moved whole: the queue package's e2e would import the kernel, so the generic provisioner stays
  and the inventory and its naming rule moved.
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

The language-model technology lives in `packages/llm` (the provider builders) and `kernel/llm`
(Anthropic's, configured by `LlmConfig`); `chat` keeps only `AssistantLlmFromConfig` with its prompts
and its purposes, and its test builds the models from `LlmConfig`.

- **Why:** a second provider is added in one place; the test takes the path the app takes.
  `AssistantLlmFromConfig` builds both models itself, since a service between them failed the
  deletion test.
- **Sources:** `docs/knowledge/ai.md`; the roadmap's `openai-provider` and `bedrock-provider`.
- **Rejected:** a provider layer kept only for the test: an interface only a test uses. The test
  building the models itself: it would copy chat's settings and check its copy.
- **Cost:** the test's setup names the environment variables; a purpose is still keyed by
  provider and carries Anthropic's request settings, so a second provider adds a key in `chat`
  too.
- **Guarded by:** the row of a module's `services/` in
  [architecture.md › Dependency rules](architecture.md#dependency-rules); the
  `AssistantLlmFromConfig` suite over a recording client.
- **If reversed:** the provider choice moves back into `chat`, and each new provider changes the
  module.
- **Revisit when:** `openai-provider` lands: it decides a provider-neutral purpose, translated
  inside `kernel/llm`.

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

The data layer's names end in `Entity` (`ChatEntity`, `ChatEntityInsert`, its `Where` and `Set`);
its repositories are `<Name>Repository`; a table lives in `<name>.table.ts`, its entities in
`<name>.entity.ts`. An entity is the shape every read returns, so `ChatEntity` and
`MessageEntity` nest their attachments. A module maps with `<Model>FromEntity` in
`<model>.mapper.ts`; the domain's records are models.

- **Why:** a reader tells the data's view from the domain's by the name alone, and a table from its
  entity by the file; tables that import only tables leave the entities free to nest one another
  without an import cycle.
- **Sources:** the ticket's naming survey; `.claude/rules/naming.md`.
- **Rejected:** a flat entity beside a second one with its attachments: a second name for the one
  shape every read returns. The service composing a chat from two repositories: two queries and a
  grouping where one relational read serves.
- **Cost:** a store has two files where it had one.
- **Guarded by:** `.claude/rules/naming.md`; the `kernel/data/**` override keeps models out.
- **If reversed:** a rename, and the tables back into the entity files, where nesting reads
  bring the import cycle back.
- **Revisit when:** a store needs a read shape other than its entity's.

### Checks kept in the tables

The tables keep their checks: the data layer declares the enums' values and the checks' limits
and patterns, and the models import them to check the same rules on their side.

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
  the model imports it; a mapper's unit test round-trips the model's extreme values through the
  entity, and the data layer's e2e check the table's side
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
  loser that reads after it gets its `409`. A send's untagged files stay tagged bound if it rolls
  back.
- **Guarded by:** the repositories' writes die on a missed row; the e2e races of two sends, on one
  file and on overlapping sets, assert one sent, one refused, and the loser's other files free.
- **If reversed:** the reads take `forUpdate` again, and a check whose loser must get a domain
  error waits on the winner's commit.
- **Revisit when:** a race's `500` reaches users often enough to need its own refusal.

### Reads in creation order

A read of a chat's messages or of attachments answers them in creation order, `createdAt` then
`id`: the attachments of a message or of a send, whatever order the ids were asked in. The chat
list alone answers newest first. An error over a
list of ids, such as `AttachmentNotFoundError`'s `ids`, names each missing id once, in the order
asked.

- **Why:** one order for a chat's contents, written once in each repository's `ORDER BY` and in
  the memory fakes; a send's message answers its attachments as a later read of the chat does.
- **Sources:** [database.md › Schema and entity files](database.md#schema-and-entity-files) (the
  index that serves it).
- **Rejected:** the order asked, kept by sorting the rows by the ids in the service: a second
  order for one read, lost again when the chat is read back.
- **Cost:** a client that sends `[b, a]` gets `[a, b]` back when `a` was uploaded first, and
  reorders them itself if it needs the order it asked.
- **Guarded by:** the repositories' e2e read rows created out of id order in creation order; the
  memory fakes sort by the same order; the attachment model's unit test names the missing ids in
  the order asked.
- **If reversed:** the service sorts what the repository reads by the ids asked, and a chat read
  back still answers creation order.
- **Revisit when:** a client needs its attachments in an order it chooses.

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
layer declares the key and the `unbound` tag; `kernel/aws/resources` declares the bucket's name
and lifecycle; `deployment` reads both.

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

### Jobs as a table in the data layer

Jobs are the table `jobs` and `JobRepository` in the data layer, each row with its status
(`queued`, `running`, `done`, `failed`); `JobSender.send` in `kernel/job` writes the row `queued`
in the caller's transaction and sends it to SQS at once, after the use case's other writes, so a
send SQS refuses is a defect that rolls the transaction back: a commit never stands without its
job on the queue, and a rollback keeps no row. `JobConsumer` marks the row `running` before its
handler, then `done`, `failed` on the last attempt, or `queued` again for the retry. "Outbox"
names the pattern, not the table.

- **Why:** a row is a job, the glossary's word, and stays after the send; the table is data like
  any other, the transport the boundary's; a send inside the transaction needs no relay polling
  the table and no sweep, and a refused send answers the request with a `500` instead of a reply
  that never comes.
- **Sources:** the guide's outbox written "in the same transaction"
  ([integration-of-bounded-contexts](https://software-architecture-guild.com/guide/architecture/domains/integration-of-bounded-contexts/)).
- **Rejected:** the send after the commit (`Transaction.afterCommit`): a send SQS refused answered
  `202` and left the job unsent and its chat `queued` for good. A sweep resending the unsent rows:
  a schedule and a route of its own, and a reply up to a minute late. A failed reply written
  after a refused send: a second write, which fails too when the database is the cause. The
  whole send after the commit, row included: a crash between the commit and the row's insert
  would lose the job. The table named `outbox`: it names the pattern and goes wrong once rows
  outlive the send. An event ledger: a row is a command for the worker, not a fact others
  subscribe to. `JobSender` in the data layer: the data would know the queue's job shape. A relay
  polling the table: a process of its own that Lambda does not keep running. An outbox per
  module: needed only with a schema per module.
- **Cost:** SQS may deliver a job before its commit shows the row: the worker reads none, a
  defect, and SQS retries it after the first retry delay, an attempt spent. A commit that fails
  after the send leaves a job with no row, retried, then dead-lettered. The transaction stays
  open for the SQS call; the use cases import a part of the kernel besides the data layer.
- **Guarded by:** the `kernel/data` and `use-cases` rows of
  [architecture.md › Dependency rules](architecture.md#dependency-rules); the `JobSender` e2e;
  the api e2e of a send whose queue is gone.
- **If reversed:** a rename in a migration, or the transport inside the data layer.
- **Revisit when:** a flow does slow work after its first write, which would hold the
  transaction open; or the logs show many retries of jobs sent before their commit.

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
  type-blind reader can see.
- **If reversed:** a test beside the rule, kept in step with every new module; a list per unit
  again, or a folder split into a workspace per unit
  ([Imports through subpaths](#imports-through-subpaths)), its dependencies in place of the lists.
- **Revisit when:** review misses a violation the rule names, or a tool gains the check.

### Imports through subpaths

A file imports its own unit's files through the workspace's `#…` subpaths, never a relative path,
and another unit only through that unit's entry, even inside one workspace. A unit of the
kernel, of `packages/` or of `application/` is imported by its folder: each of the three folders
is one workspace with one export per unit, its `index.ts`, and its test support. `http-api` and
the apps keep their package names. The forms, with examples:
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
share lives in a ring below them.

- **Why:** each app is one process with its own deployment; an import between them ships one
  process's code and dependencies inside another.
- **Sources:** `apps/CLAUDE.md`; `deployment/aws` deploys each app as a service of its own.
- **Rejected:** a shared helper in one app imported by another: it couples their releases.
- **Cost:** a helper both processes need moves down into a module, the kernel or a package.
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
  checks: the behaviour runs over memory, the real stores are tested in the kernel, a mapper
  beside itself, the flow a user starts through the api. A part's
  tests and support sit with the part they test or build, as a package's do.
- **Sources:** `.claude/rules/effect-tests.md`; `vitest.config.ts` selects by folder.
- **Rejected:** test folders at a workspace's top: support beside the source folders. The
  kernel's tests in one pair of test folders at its top: a part's tests away from it, and one
  support barrel for every part. Every package's support in `packages/testing`: a package's own
  harness away from it, behind a barrel every unit imports. The use cases' e2e in
  `application`, a use case called on Postgres: a call, not the flow a user starts. The mappers'
  round trips on Postgres, in `application/<module>/__e2e__/`: an e2e for what a unit test over
  the schemas and the data layer's e2e of its checks already prove. The e2e in each app: the
  journey would make
  the api import the worker, and apps never import each other. The e2e workspace at the root: a
  test of the processes away from them. The workspace as an `__e2e__/` folder in `apps/`: such
  a folder everywhere else holds the e2e of its own folder's source. The e2e support in
  `__e2e__/testing/`, exported under a name of its own: a third test folder, and an import name no
  folder carries. A label in the file name (`<name>.e2e-layer.ts`) beside the unit test support:
  the label is lost behind the `/testing` entry, which every unit test may import.
- **Cost:** a use case's race or rollback runs through the api with both processes up, slower than a
  call of the use case. The kernel declares an alias per part's support, and an export where another
  unit reads it. The run's `globalSetup` sits in the data's e2e support, though it starts the
  MiniStack every workspace's e2e uses. No tool refuses an import of e2e support a unit test
  never builds, nor test support in source: review does.
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
- **Cost:** the memory repositories were rewritten over entities.
- **Guarded by:** review of each step's test diff; nothing in `make check`.
- **If reversed:** a refactor can drop a case with no one noticing.
- **Revisit when:** a case tests an interface that no longer exists, not a behaviour.

### One initial migration

The migrations restarted as one initial migration generated from the data layer; every database
was recreated (`make reset`).

- **Why:** the app is not in production, so no deployed row needs a migration path; one migration
  reads as the schema, and the rename to `jobs` cost nothing.
- **Sources:** `docs/knowledge/database.md`.
- **Rejected:** the old migrations kept and `outbox` renamed in a third: a history no deployed
  database needs.
- **Cost:** every database was recreated once, losing its rows; the old migrations live only in
  `git log`.
- **Guarded by:** `make migration-check` (the data layer matches the migrations).
- **If reversed:** nothing to undo; once the app is in production, every change is a migration
  again.
- **Revisit when:** the app reaches production: restarting the migrations is then forbidden.

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

Every round of a ticket's step is a commit, named by its stage, step, round and source
(`.claude/rules/commits.md › A ticket's rounds`), committed as soon as `make check` is green and
before the user reads it; the user's own edits, found between rounds, are a round of their own,
and no commit the user has seen is rewritten before the PR.

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
  user's edits folded into the next agent round: that round's diff is no longer the agent's.
- **Cost:** more commits on the branch, a rejected round among them as a revert; a subject longer
  by the id, which counts apart from its 50 characters; a commit takes 1.3 s for docs and 2.5 s
  for code with the pre-commit hook. Every reader of the step's diff reads a committed range
  (`make review-rules BASE=<base>`, the parallel steps' pick, the claimed finding's worktree), and
  `git revert` is in the allow list of `.claude/settings.json`. A rejection after later work rests
  on a round fixes forward, since a revert there would pull the base from under that work.
- **Guarded by:** review against `.claude/rules/commits.md` and `.claude/rules/sdd.md`; nothing
  checks a subject's id.
- **If reversed:** one commit in `commits.md`, `sdd.md` and `/ticket-implement` brings back one
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
