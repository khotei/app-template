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
const deleteUser = Effect.fn('DeleteUserUseCase.deleteUser')(function* (id: UserId) {
  yield* ChatService.deleteAllOf(id)
  yield* UserService.delete(id)
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
- **Guarded by:** a module's services and infrastructure cannot import `@app-template/use-cases`
  (their Biome overrides); `.claude/rules/modules.md` refuses a rule in a use case and a job that
  carries a module's reaction to another module's write.
- **If reversed:** events between modules need an event ledger, a handler per reaction and
  at-least-once delivery; a send that spans modules loses its one transaction.
- **Revisit when:** a module must be extracted into its own process, or a flow must outlive the
  request it starts in for a reason other than slow work.

### Module contracts

A module other modules need exposes a contract, its own workspace in the module's folder, created
with its first consumer: `identity-contract` (`UserId`, `UserUnknownError`, `CurrentUser`,
`Auth`). A dependency on a module's contract counts as one on the module.

- **Why:** `chat` and `http-api` need these four and nothing else of identity; a workspace of its
  own lets the linker refuse the rest.
- **Sources:** the guide's "design contracts around use cases, not around internal entity
  models"
  ([contracts](https://software-architecture-guild.com/guide/architecture/boundaries/contracts/));
  Spring Modulith's named interfaces and Packwerk's public folder (research).
- **Rejected:** a `contract/` subpath export of the module: a consumer then declares the whole
  module, and the linker no longer stops it reaching the rest.
- **Cost:** a nested workspace needs `exclude` and a reference in its module's `tsconfig.json`;
  `Auth`, an HTTP middleware, lives outside `http-api`; `http-api` also reads identity's `domain`,
  since its user DTO is the `User` model.
- **Guarded by:** the isolated linker (an undeclared module fails with TS2307); the Biome
  overrides on `application/*/domain/**` and `application/*/contract/**`; `tsc -b` refuses a cycle
  of project references (TS6202); `.claude/rules/modules.md` refuses a cycle through contracts.
- **If reversed:** a consumer that declares the module reaches its services and data mappers,
  and two modules can depend on each other with no tool noticing.
- **Revisit when:** a second consumer needs more of a module than its contract holds: grow the
  contract, never import past it.

### A module's layers

A module holds `domain/`, `services/` and, once it has an adapter, `infrastructure/`, with the
same `#domain/*`, `#services/*` and `#infrastructure/*` aliases in every module and an export per
layer. A repository is no port: a service calls the data layer's repository directly.

- **Why:** `domain/` ships to the browser, so what reads the data cannot sit there; the data
  layer's repository already is the contract a service needs, and a port with an adapter over it
  would repeat its methods; the same aliases let one Biome override per layer cover every module.
  A handler calls one service method or one use case, never a repository, so each record has one
  owner every caller goes through.
- **Sources:** the guide's "Keep internal layering per module"
  ([styles/modular-monolith](https://software-architecture-guild.com/guide/architecture/styles/modular-monolith/));
  `.claude/rules/layering.md`.
- **Rejected:** ports in `domain/` with adapters over the data layer: two layers with the same
  methods. An alias per module (`#<module>/…`): an override per module.
- **Cost:** a service depends on the data layer directly, so its unit tests take the data layer's
  memory repositories; an alias does not name its module.
- **Guarded by:** the Biome overrides on `application/*/domain/**` (no `#services/**` or
  `#infrastructure/**`, no workspace but the contracts), `application/*/services/**` (no
  `#infrastructure/**`), `application/*/infrastructure/**` (no `#services/**`),
  `application/use-cases/**` (no module's `infrastructure`) and `apps/api/**` and `apps/worker/**`
  (no data layer and no mapper but in `layer.ts`); `make bundle-check` (no service, repository or
  adapter in the browser).
- **If reversed:** a port per repository comes back with five adapters that only delegate, and
  every override is repeated per module.
- **Revisit when:** a service needs a store the data layer cannot reach, or the domain stops
  shipping to the browser.

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
- **Guarded by:** the Biome override on `http-api/**` (no workspace but the contracts and a
  module's `domain`); the `apps/web/**` override; `make bundle-check`.
- **If reversed:** a handler inside its module imports the assembled `Api`, which imports the
  module: a cycle `tsc -b` refuses.
- **Revisit when:** the groups stop being assembled into one `Api`, or a module serves its own
  HTTP surface.

### Status owned by chat

`Status` belongs to `chat`.

- **Why:** only the chat and the message use it.
- **Sources:** the ticket's survey of its users.
- **Rejected:** `Status` in a shared place: a vocabulary owned by no module.
- **Cost:** none today.
- **Guarded by:** a module's `domain/` imports no other module but its contract, so no other
  module can reach it.
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

## The kernel and the data

### One kernel

One kernel workspace, `@app-template/kernel`, with subpaths `/config`, `/postgres`, `/aws`,
`/aws/resources`, `/queue`, `/llm` and `/data`, holds the data and the boundary's configured
clients and no service rule; `packages/*` is configurable and knows no app.

- **Why:** the AWS inventory, the pinned images and the clients' wiring are one kind of code: this
  app's tools and data. One workspace keeps one manifest and one project.
- **Sources:** the guide's "Keep the kernel tiny" and "shared 'domain' utilities are treated as a
  smell"
  ([integration-of-bounded-contexts](https://software-architecture-guild.com/guide/architecture/domains/integration-of-bounded-contexts/),
  [styles/modular-monolith](https://software-architecture-guild.com/guide/architecture/styles/modular-monolith/)).
- **Rejected:** a package per kernel part: seven manifests for one app's tools. `packages/aws`
  moved whole: the queue package's e2e would import the kernel, so the generic provisioner stays
  and the inventory and its naming rule moved.
- **Cost:** one manifest declares every client's dependency, so the linker no longer stops a
  module reaching a kernel part it does not use, and inside the kernel the data's direction rests
  on Biome, not on `tsc -b`.
- **Guarded by:** the Biome overrides on `kernel/**` (no module, contract, use case, `http-api` or
  app), `packages/**` (no kernel) and `deployment/**` (of the kernel only `/config`,
  `/aws/resources` and `/data/file`); `.claude/rules/modules.md` refuses a service rule or a model
  in the kernel.
- **If reversed:** split into packages, the kernel's parts gain a manifest and a project each;
  with service rules in it, the kernel becomes the shared domain the guide calls a smell.
- **Revisit when:** a kernel part grows dependencies most modules must not reach; `/data` is the
  first candidate for a workspace of its own.

### The language model in the kernel

The language-model technology lives in `packages/llm` (the provider builders) and `kernel/llm`
(the provider chosen by `LlmConfig`); `chat` keeps only `AssistantLlm` with its prompts and its
purposes, and its test builds the models from `LlmConfig`.

- **Why:** a second provider is added in one place; the test takes the path the app takes.
  `AssistantLlm` builds both models itself, since a service between them failed the deletion test.
- **Sources:** `docs/knowledge/ai.md`; the roadmap's `openai-provider` and `bedrock-provider`.
- **Rejected:** a provider layer kept only for the test: an interface only a test uses. The test
  building the models itself: it would copy chat's settings and check its copy.
- **Cost:** the test's setup names the environment variables; a purpose is still keyed by
  provider and carries Anthropic's request settings, so a second provider adds a key in `chat`
  too.
- **Guarded by:** the Biome override on `application/*/services/**` (no `@app-template/kernel/llm`);
  the `AssistantLlm` suite over a recording client.
- **If reversed:** the provider choice moves back into `chat`, and each new provider changes the
  module.
- **Revisit when:** `openai-provider` lands: it decides a provider-neutral purpose, translated
  inside `kernel/llm`.

### The data at the centre

`kernel/data` holds every store (tables, relations, the attachments' objects) and its
repositories in its own types, one `Db` over every table; it imports only `packages/*` and takes
its clients from the context. The tables stay in `public` with their foreign keys.

- **Why:** the data is the app's source of truth; one place declares every store, joins and
  foreign keys included, and every module reads what it needs.
- **Sources:** departs from the guide's "share a physical database, but not each other's tables"
  ([styles/modular-monolith](https://software-architecture-guild.com/guide/architecture/styles/modular-monolith/))
  and "The service that writes to a table owns that table"
  ([managing-operational-data](https://software-architecture-guild.com/guide/architecture/boundaries/managing-operational-data/)).
- **Rejected:** a Postgres schema and a typed Drizzle per module, no key across modules:
  boundaries on data the app reads as one. The tables, repositories and models together in the
  kernel: a shared domain, the guide's coupling magnet.
- **Cost:** most features change `kernel/data`; two modules may use one repository, so a change of
  its behaviour reaches both, held by the repository's e2e; a module can be extracted only with
  its stores carved out of the data layer.
- **Guarded by:** the Biome override on `kernel/data/**` (no workspace but `packages/*`, no
  `#kernel/**` but `#kernel/data/**`); `.claude/rules/modules.md` refuses a model or a service rule
  there; the repositories' e2e in `kernel/data/__e2e__`.
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

The tables keep their checks: the data layer redeclares the enums' values and the checks' limits
and patterns itself, and the models check the same rules on their side.

- **Why:** the database stays a guard against any writer, as the partial unique index already
  is.
- **Sources:** the guide's "Foreign keys, views, triggers, and logical invariants encode coupling
  between tables"
  ([managing-operational-data](https://software-architecture-guild.com/guide/architecture/boundaries/managing-operational-data/)).
- **Rejected:** the checks dropped, the rule only in the services: the database would accept a
  row the app never writes.
- **Cost:** a limit or a pattern lives twice (`maxTitleLength`, `mediaTypePattern`,
  `secretHashPattern`, the statuses).
- **Guarded by:** the mappers' e2e in `apps/__e2e__/mappers` writes each model's extreme value
  and every value of its statuses and authors through its entity, so a drift fails the write
  or the read back; `make migration-check`.
- **If reversed:** a migration drops a check, and a writer past the services can store a row no
  model decodes.
- **Revisit when:** a duplicated limit drifts despite the e2e, or a rule cannot be a check.

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
- **Guarded by:** the Biome overrides on `kernel/data/**` (no `#kernel/postgres`, `#kernel/aws` or
  `@app-template/kernel/config`) and `application/use-cases/**` (of the kernel only the data
  layer); the layer's requirements in `tsc -b`.
- **If reversed:** the data layer builds its clients from `/config`, and every test of it needs
  the configuration of a real store.
- **Revisit when:** a store's client needs data-layer knowledge to be built.

### Files in the data layer

Files are `FileEntity` and `FileRepository` in `kernel/data/file`: `insert` (answering the byte
count it stored), `selectOne`, `update`, `delete` and `url`, over the `S3Bucket` in the context.
The data layer declares the key and the `unbound` tag; `kernel/aws/resources` declares the
bucket's name and lifecycle; `deployment` reads both.

- **Why:** a consumer reads and writes through one kind of repository, whichever store holds the
  data; the objects stay in their bucket under their keys.
- **Sources:** the ticket's design; `docs/knowledge/aws.md`.
- **Rejected:** a bucket port in `chat` with an S3 adapter: a module's adapter over data every
  module may need. The bucket's name and lifecycle in the data layer: the name depends on the
  stage, a configuration the data does not read.
- **Cost:** one interface over a store that joins no transaction: the bytes are stored before the
  row that binds them and deleted once the rows are gone.
- **Guarded by:** the repository's doc comment and `.claude/rules/layering.md` (the order); the
  delete-chat e2e in `apps/__e2e__/use-cases`; the file repository's e2e in
  `kernel/data/__e2e__/file`; the `deployment/**` override (of the data only `/data/file`).
- **If reversed:** the port goes back into `chat`'s `domain/` with its adapter in
  `infrastructure/`, and a second module needing files imports chat.
- **Revisit when:** `shared-files` or `assistant-files` needs files outside a chat.

### Jobs as a table in the data layer

Jobs are the table `jobs` and `JobRepository` in the data layer; `QueueSenderJobs`,
`QueueConsumerSqs` and `JobRelaySqs` live in `kernel/queue` over it, composed by layers;
`QueueSender` stays one service. "Outbox" names the pattern, not the table.

- **Why:** a row is a job, the glossary's word, and stays after the relay sends it; the table is
  data like any other, the transport the boundary's; one service keeps the use cases unchanged.
- **Sources:** the guide's outbox written "in the same transaction"
  ([integration-of-bounded-contexts](https://software-architecture-guild.com/guide/architecture/domains/integration-of-bounded-contexts/)).
- **Rejected:** the table named `outbox`: it names the pattern and goes wrong once rows outlive
  the send. An event ledger: a row is a command for the worker, not a fact others subscribe to.
  `QueueSenderJobs` in the data layer: the data would know the queue's job shape. An outbox per
  module: needed only with a schema per module.
- **Cost:** none today.
- **Guarded by:** the `kernel/data/**` override (the data imports no `#kernel/queue`); the queue's
  e2e in `kernel/queue/__e2e__`.
- **If reversed:** a rename in a migration, or the transport inside the data layer.
- **Revisit when:** `jobs` adds the statuses to the same table.

## Guards, tests and history

### Guards are configuration

The guards are `exports`, the isolated linker, `tsc -b`, Biome and the bundle check; what no
configuration expresses is the review rule `.claude/rules/modules.md`, never hand-written test
code.

- **Why:** every guard is configuration of a tool the repo has; a fitness test is code to keep,
  and drifts.
- **Sources:** the guide's "Add fitness functions in CI … turn violations into failing builds"
  ([styles/modular-monolith](https://software-architecture-guild.com/guide/architecture/styles/modular-monolith/));
  in modular-monolith-with-ddd an architecture test checks the wrong assembly (research).
- **Rejected:** a module-graph test: test code for a rule review can hold. dependency-cruiser: it
  needs a TypeScript parser the repo lacks.
- **Cost:** what only the review rule names passes `make check` when review misses it.
- **Guarded by:** `make check` runs them all; the Standards reviewer reads `.claude/rules/`.
- **If reversed:** a test beside the rule, kept in step with every new module.
- **Revisit when:** review misses a violation the rule names, or a tool gains the check.

### Imports through subpaths

Inside a workspace a file imports through the workspace's `#<workspace>/…` subpaths (`#domain/*`,
`#kernel/*`), never a relative path; across workspaces through the package name.

- **Why:** a subpath names the layer it reaches, so a Biome override can refuse it by pattern; a
  relative path hides the layer and can reach into another workspace's files.
- **Sources:** `.claude/rules/naming.md`; `tsc -b`'s TS6059 and TS6307 on a path into an
  unreferenced workspace.
- **Rejected:** relative paths inside a layer only: one more rule for a reader to apply, and no
  pattern tells a layer's own folder from the next.
- **Cost:** every workspace declares its `imports` in `package.json`.
- **Guarded by:** the root `noRestrictedImports` pattern and its copy in every Biome override.
- **If reversed:** the per-layer overrides no longer see which layer a relative import reaches.
- **Revisit when:** Biome can restrict an import by the folder it resolves to.

### Independent apps

`apps/api`, `apps/worker` and `apps/web` never import each other or `deployment`; what two apps
share lives in a ring below them.

- **Why:** each app is one process with its own deployment; an import between them ships one
  process's code and dependencies inside another.
- **Sources:** `apps/CLAUDE.md`; `deployment/aws` deploys each app as a service of its own.
- **Rejected:** a shared helper in one app imported by another: it couples their releases.
- **Cost:** a helper both processes need moves down into a module, the kernel or a package.
- **Guarded by:** the Biome overrides on `apps/api/**`, `apps/worker/**` and their tests, and
  `apps/web/**`; the journey e2e that runs both processes lives in `apps/__e2e__`.
- **If reversed:** a process pulls the other's dependencies and layer, and an app can no longer
  be deployed alone.
- **Revisit when:** two apps merge into one process.

### Tests in their folders

Every workspace keeps its unit tests in `__tests__/` and its e2e in `__e2e__/`, each with its
support in a `testing/` inside, exported as `./testing` and `./testing-e2e`; the kernel's parts are
units like packages, so each part keeps its own (`kernel/<part>/__tests__/`,
`kernel/<part>/__e2e__/`), its support exported as `./<part>/testing` and `./<part>/testing-e2e`
and aliased `#testing/<part>/*` and `#testing-e2e/<part>/*`. An e2e suite may import `./testing`, a
unit test never `./testing-e2e`; `application` has unit tests only, and the e2e over assembled
layers live in `apps/__e2e__`.

- **Why:** the folder tells a unit test from an e2e and from source; the behaviour runs over
  memory, the real stores are tested in the kernel, the assembled layers in the apps. A part's
  tests and support sit with the part they test or build, as a package's do.
- **Sources:** `.claude/rules/effect-tests.md`; `vitest.config.ts` selects by folder.
- **Rejected:** test folders at a workspace's top: support beside the source folders. The
  kernel's tests in one pair of test folders at its top: a part's tests away from it, and one
  support barrel for every part. The use cases' and mappers' e2e in `application`: the
  behaviour would need containers. The e2e in each app: the journey would make the api import the
  worker, and apps never import each other. The e2e workspace at the root: a test of the
  processes away from them.
- **Cost:** the drift check of the tables' checks lives in `apps/__e2e__`, away from the mappers.
  The kernel declares an alias and an export per part's support. The run's `globalSetup` sits
  in the data's e2e support, though it starts the MiniStack every workspace's e2e uses.
- **Guarded by:** every `__tests__/**` Biome override bans `#testing-e2e/**` and
  `@app-template/**/testing-e2e`; the `application/use-cases/**` override bans
  `@app-template/*/testing`, `@app-template/kernel/*/testing` and
  `@app-template/kernel/*/testing-e2e` in source; the `kernel/data/__tests__/**` override keeps the
  data layer's bans on its memory repositories; the vitest projects `unit` and `e2e` include by
  folder.
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
- **Guarded by:** `make doc-names` (every backticked name exists) and `make ids` (no ticket ids
  outside `docs/tickets/`); review against `.claude/rules/claude-md.md`.
- **If reversed:** the decisions go back to the tickets, and the pointer in `CLAUDE.md` goes.
- **Revisit when:** the records outgrow one page.
