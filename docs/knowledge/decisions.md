# Decisions

The architecture decisions that bind the code today, one entry each: why it holds, what it costs,
what refuses a change that breaks it, and what a reversal would undo. **Read a decision before
changing a module boundary, the data layer, the kernel, a guard or anything a decision names,
and state the consequences first.** A change to a decision rewrites it in the same commit; a new
binding decision adds one. The history, the dates and the rounds stay in the ticket that made it
and in `git log`.

Each decision has seven fields: **Why**, **Sources**, **Rejected**, **Cost**, **Guarded by**, **If
reversed** and **Revisit when**. The guide is the Software Architecture Guild's
[architecture guide](https://software-architecture-guild.com/guide/architecture/); "the ticket"
of a decision's Sources is the one that made the first decisions,
`docs/tickets/2026-10-31-0926_modular-monolith/`, its sources in
[research.md](../tickets/2026-10-31-0926_modular-monolith/research.md); a later decision that cites
its ticket links it. Decisions older than the first ones live in `architecture.md › Decisions`
of their tickets ([architecture.md](architecture.md) names them). How the code is cut and what
may import what:
[architecture.md › Dependency rules](architecture.md#dependency-rules).

**Where the app departs from the guide, on purpose:** one data layer for every module
([The data at the centre](#the-data-at-the-centre)), every module writing any record
([Records open, rules called](#records-open-rules-called)), the HTTP layer outside the modules
([HTTP outside the modules](#http-outside-the-modules)) and a transaction across modules
([Use cases above the modules](#use-cases-above-the-modules)).

## Modules

### Modules by capability

The behaviour is split by business capability, a module per capability under `application/`:
`chat` and `identity`.

- **Why:** a module owns what changes together. `identity` names the capability, and `user` is
  reserved in Postgres.
- **Sources:** the guide's "a module's mission fits one sentence" and "what always changes
  together belongs in one module"
  ([defining-components](https://software-architecture-guild.com/guide/architecture/boundaries/defining-components/));
  the ticket's count of the imports.
- **Rejected:** a module per table: the guide's anemic modules.
- **Cost:** `chat` is the largest module.
- **Guarded by:** review; no tool sees a capability.
- **If reversed:** modules split by table, and a flow over one capability spans several.
- **Revisit when:** files come back with a life outside a chat
  ([Attachments removed](#attachments-removed)); they may take a module of their own.

### Use cases above the modules

Every use case lives in `application/use-cases`, above the modules: synchronous, one transaction
whatever modules it touches; no events, facades or reactions between modules. A use case
composes the modules' services and model rules, holds the transaction, orders the writes against
a store outside it and enqueues the jobs, and holds nothing else: a rule, a read or a write stays
in its module's models and services, and a request's rules with the writes of one module that
commit together sit in a service of that module, the transaction piped on those writes
(`AskChatService`, [Composition: wrap or compose](#composition-wrap-or-compose),
[layering.md › Use cases](../../.claude/rules/layering.md#use-cases)). The shape:
[architecture.md › A use case](architecture.md#a-use-case).

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
  data layer does not have. A use case that reads or writes a repository itself: a second owner of
  the record's coding and guard, which the next flow copies (a Run's guarded write was coded
  twice).
- **Cost:** a module's flows live outside the module; a shared transaction makes a module harder
  to extract. A read or a write one flow needs becomes a service method first.
- **Guarded by:** the rows of a module's layers in
  [architecture.md › Dependency rules](architecture.md#dependency-rules);
  `.claude/rules/layering.md › Use cases` refuses a rule or a capability in a use case, and
  `.claude/rules/modules.md` a job that carries a module's reaction to another module's write.
- **If reversed:** events between modules need an event ledger, a handler per reaction and
  at-least-once delivery; a send that spans modules loses its one transaction.
- **Revisit when:** a module must be extracted into its own process, or a flow must outlive the
  request it starts in for a reason other than slow work.

### Use cases as functions

A use case, and a job's `send<Job>`, is an `Effect.fn` that yields what it composes, its type
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
  leaves, not the use cases; a span is the function's name.
- **Guarded by:** `tsc`: a service the process does not provide, an error the endpoint does not
  list, a job's failure at `consumeQueue`.
- **If reversed:** each use case and each `send<Job>` become a `Context.Service` whose layer provides
  the services it composes, and each handler group and the worker's route provide those layers.
- **Revisit when:** a use case needs a second implementation, a test double or state of its own.

### Module contracts

A module other modules need exposes a contract, a folder of the module created with the first module
that imports it, `application/<module>/contract/`, exported through the module's one entry with the
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
  review's (`modules.md`), not Biome's. A contract imports no workspace but
  `@app-template/packages/schema`, which knows no app, so its ids are built like the domain's
  ([Utils apart from models](#utils-apart-from-models)).
- **Guarded by:** the rows of a module's layers and of a contract in
  [architecture.md › Dependency rules](architecture.md#dependency-rules);
  `.claude/rules/modules.md` refuses a name past the contract, a module importing one above it
  and a cycle through contracts.
- **If reversed:** a module that imports another's entry reaches its services and
  models, and two modules can depend on each other with no tool noticing.
- **Revisit when:** a second module needs more of a module than its contract holds: grow the
  contract, never import past it.

### A module's layers

A module holds `domain/`, `services/` and, once it reaches the environment, `infrastructure/`,
behind one entry, its `index.ts`, which re-exports every layer; its files reach each other
through aliases that name the module (`#<module>/domain/*`). A module's `infrastructure/` holds
everything of the module that connects to the environment (a language model, a queue, a
bucket): the adapters of its ports, the services a use case or the chat's worker services call
over a client ([The language model in the kernel](#the-language-model-in-the-kernel)), its queues'
definitions with the send of each job, which the chat's ask service (`AskChatService`) may call
([Jobs as queue messages](#jobs-as-queue-messages)). A repository is no port: a service calls
the data layer's repository directly.

- **Why:** `domain/` holds the rules as pure functions over values passed in, so what reads the
  data cannot sit there. Nothing of it reaches the browser any more
  ([The API contract in the api](#the-api-contract-in-the-api)), so it takes from the data layer
  the values its tables declare (a limit, a pattern, an enum's values, a JSON column's shape,
  which the table already declares as a schema) instead of declaring them again, and keeps its
  own brands, models and refinements: the vocabulary is the domain's, and the data layer stays
  free of models ([The data at the centre](#the-data-at-the-centre)). The
  data layer's repository already is the contract a service needs, and a port with an adapter
  over it would repeat its methods; the aliases keep the layer in every import line, so each
  layer's Biome override matches the others by glob (`#*/services/**`). A handler calls one
  service method or one use case, and a use case calls services, neither a repository, so each
  record has one owner every caller goes through.
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
  of a value's shape (`<name>Pattern`, a JSON column's `<Name>Failure`), so a value of a new
  shape widens the guard's pattern; one entry opens the
  module whole, so another part's ban on a layer matches the names it imports. A layer's override
  covers its tests, save the services', so what they need passes in its source too. What passes
  every guard: [architecture.md › Known gaps](architecture.md#known-gaps).
- **Guarded by:** one Biome override per layer, matching every module by glob and covering the
  layer's tests, save the services', whose tests have one of their own, the domain's admitting
  of the kernel only `@app-template/kernel/data`, and of it only a value's name
  (`<name>Pattern`, `<name>Statuses`), the services' admitting neither
  `@app-template/kernel/aws` nor `@app-template/packages/queue` nor test support, nor any of
  their infrastructure, and their tests' admitting test support and the queue file
  (`#*/infrastructure/*.queue`), whose jobs the ask service's tests read; the
  chat's ask service (`ask-chat.service.ts`) its own, which adds `Transaction` alone of
  `@app-template/packages/db` and of the infrastructure the queue file alone, the chat's reply
  service (`reply-chat.service.ts`) its own, which adds `Transaction` alone and the message's
  assistant's `.llm` file alone, and its title service (`title-chat.service.ts`) its own, which
  adds the chat's assistant's `.llm` file alone
  ([The chat's jobs in their services](#the-chats-jobs-in-their-services)):
  the rows of a module's layers in
  [architecture.md › Dependency rules](architecture.md#dependency-rules); `make bundle-check`,
  which reads the web bundle's metafile and refuses the module's package in it;
  `.claude/rules/layering.md`, a repository or the data layer in an app's handler.
- **If reversed:** a port per repository comes back with an adapter each that only delegates; an
  export per layer brings back the subpaths and a ban per layer by path; a domain without the
  data layer declares each value again, and a mapper's unit test per value compares the copies.
- **Revisit when:** a service needs a store the data layer cannot reach, or the data layer
  brands its ids and constrained strings itself, so the domain could take its schemas too.

### HTTP outside the modules

The HTTP groups, their handlers and the errors only HTTP raises (`RequestInvalidError`) live in
`apps/api`, outside the modules; the id format, its schema (`buildIdSchema`) and its generation
(`idGenerator`), lives in `packages/schema`.

- **Why:** a handler needs the assembled `Api`, which imports the groups, so a module owning its
  handler would make a cycle. No module raises them. The id format knows no app (a brand in, a
  schema out; a schema in, a fresh UUIDv7 of its brand out), every module's ids share it, and in
  one file a change of format moves the schema and the generation together. `idGenerator` is
  a constant, an effect that reads `SecureRandom` once and returns the generator, not a
  `Context.Service`: no test or second implementation stands in for it, since `SecureRandom`
  already is that seam (tests provide `BunCrypto.layer`, or a `Layer.mock` of `SecureRandom` to
  assert an id). A service yields it in its `make`, so its methods require no `SecureRandom`.
- **Sources:** departs from the guide's "Keep internal layering per module (API → domain →
  infrastructure)"
  ([styles/modular-monolith](https://software-architecture-guild.com/guide/architecture/styles/modular-monolith/));
  `.claude/rules/composition.md › Minimal means inside each unit` (a copy per variant becomes one
  unit over the varying value).
- **Rejected:** the generation spelled out at each call, or copied per module: two copies of a
  rule no module owns. A `generateId` that reads `SecureRandom` itself: `SecureRandom` is
  Effect's own service with no default, so it would enter every service method's requirements. A
  `generateId` taking `SecureRandom` as a parameter: each call passes the same service along. An `IdGenerator`
  `Context.Service` with a `layer`: a layer to provide for one implementation. The id format in
  `packages/db` beside the `id()` column, or in `kernel/data`: the domain and the contracts
  declare the schema, and neither may import those. A group in its module's `infrastructure/`,
  which no cycle forbids, as a group imports only `effect`,
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
see is omitted by each wire shape that carries it: a failed Run's failure stays in its row, off
the wire of `ApiRun` and `ApiMessage`. Its unit test writes
`apps/api/openapi.json`; the web reads that file by path and keeps the client
`@effect/openapi-generator`'s command writes from it, checked in. Nothing of `application/`
reaches the browser, and the web declares no workspace of the app but `packages`.

- **Why:** a contract of its own declared each id, constrained string, status list and error a
  second time (23 twins of the domain's, 5 ids among them, with the tables' limits, patterns
  and enums' values copied into them), held in step by a test that compared only exports of one
  name, over a module list no check saw; the browser needs none of it, since its generated
  client imports only `effect`. A struct writes only its own fields, so `mapFields` keeps a
  field off the wire with no code, and the domain's error classes encode themselves, so no
  handler translates one and no class marker internal to Effect is relied on. A failure's cause
  is the real error (the provider's text, SQS's error, a defect's trace): kept in the row, it
  stays with the Run as long as the Run does, where a log keeps it only for its retention and
  only for those who read the log; on the wire it could show a request id, a key's hint or a
  piece of the prompt, so every shape that carries a Run omits it.
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
  class, the alias `.claude/rules/effect-style.md › Composition` refuses. A `pick`
  of the wire's fields: every field listed again. `Model.Class` variants: every domain class
  rewritten as a `Model`, whose select, insert and update variants restate the row the Drizzle
  table and the model as its row's codec already state ([Entity names](#entity-names)), and
  whose json variants are a second field list per model. A client generated at build time:
  typecheck, the bundle check and the editor would need a step first. The client held by a
  vitest file snapshot of the generator's output: 27 lines of test and `@effect/vitest` in the
  web, where the generator's command and `cmp` check the same. Track B had rejected that command,
  as the test called the same service and `bunx` wrote 33 lines apart on a fetched peer `effect`
  4.1.4; the installed command, run with `--no-install` over its peer pinned in the catalog,
  covers the second half. The web importing the api's `Api`: it would install the api and the
  modules. The api's tests on the web's generated client: they assert the domain's brands,
  `DateTime` and error classes. The snapshot in a folder below both apps: the api's test would
  write outside its workspace. A name per endpoint (`OpenApi.Identifier`): an operationId is
  unique across groups, so it repeats its group anyway. A translation per handler, an identity
  `buildApi<Model>`: `tsc` refuses the drift without them. The failure's cause in the worker's
  log alone, kept out of the Run's model: lost once the log rolls over, and apart from the Run it
  belongs to.
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
  (13 for 7 errors), and a listing without `HttpApiSchema.status` responds with `500`, which likewise
  only review of the snapshot diff refuses. A user's own group goes in `api.ts`'s first
  `.add(…)`, before `.middleware(Auth)`: past it, only a handler that reads `CurrentUser` fails
  `tsc`. The web's endpoints are `<group><Endpoint>`, the components follow the domain's classes
  (`UserEncoded`) and the wire shapes' identifiers (`ApiChat`), and a class returned through more
  than one schema, the bare class and each `.pipe(HttpApiSchema.status(…))` counting as one, gets
  a numbered component (`<Class>Encoded_2`), which a wire shape's `identifier` avoids (`ApiRun`
  for the Run's three). Two checked-in files move with every
  wire change, and the web keeps a generator, with its command's peer `@effect/platform-node`
  pinned. Keeping the cause off the wire takes five wire shapes (the failure, the Run, the Run a
  message nests, the message, the `503` error), each in the snapshot, and two assertions that it
  stays off (`listMessages`, `getRun`); a new shape that nests a Run, or a new listing of an
  error with a cause, must omit it too, which only review of the snapshot diff holds.
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
  differ from what the wire carries; or a client must show a failure's cause.

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

### A failed Run keeps its text

A failed Run's `failure` holds only `cause`, the full text of what ended it: `Cause.pretty` of
the cause the use case caught (an `LlmError`, SQS's `QueueError`, a defect, an interrupt), or a
fixed sentence for a Run whose worker died. It is for operators: the wire omits the failure
whole ([The API contract in the api](#the-api-contract-in-the-api)), and a client reads a
failure from the Run's status `failed`.

- **Why:** no reader used a `reason`: the web never read it, and where no error carried a tag it
  was a placeholder, `RunAborted`. The full text is what an operator needs, and every path
  already has it.
- **Sources:** the owner's call in the design audit.
- **Rejected:** a `reason`, the failure's tag, beside the text: a stored and wire value no reader
  branches on, with a placeholder where nothing names the end. A closed list of reasons with a
  table from the errors' tags to it: a rename of names that already exist, and a table per new
  failure.
- **Cost:** a client tells a failed Run only by its status, not the language model's refusal from an
  error; bringing a reason back changes the wire contract and the column's shape.
- **Guarded by:** `RunFailure`'s schema in the data layer; the api's test that a failed Run's
  wire has no failure; the use cases' tests, which assert each path's text.
- **If reversed:** `reason` returns to `RunFailure` in `kernel/data/chat/run.table.ts` and to
  the Run's wire shapes, with each path naming its tag.
- **Revisit when:** a client must tell one failure from another.

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
  without `recognise`), and no tool stops it.
- **Guarded by:** `.claude/rules/modules.md` refuses a copied rule; nothing refuses a write.
- **If reversed:** a Biome ban per entity subpath, or a review rule on writes, forces every write
  through its owner, and the flows that write two modules' records move into use cases.
- **Revisit when:** a write past an owner's rule causes a bug, or a module is to be extracted.

### Composition: wrap or compose

Every unit, a model's function, a domain service, a util or a use case, starts simple and keeps
the one purpose it was made for. A change edits a unit only to fix it or to extend that purpose; any
other change is a new unit that wraps it (the same interface, adding one responsibility around
its calls for every holder) or composes it (a new name built from it, for the callers that need
what it adds). A use case composes services, ports and model rules and holds only its flow.
Minimal means less code inside each unit and no dead code, never fewer units. The rule:
`.claude/rules/composition.md`.

A model's records are served by domain services composed over each other, each named for what it
adds; which services a model may have and over which: [layering.md › Ports and domain
services](../../.claude/rules/layering.md#ports-and-domain-services). `<Model>Service` holds the
plain records (a create, a read by key with its `*NotFoundError`, which carries that key, as a
read by another key raises its own, a read of many, the writes that
change records alone, a delete of many under the full `where` its caller passes), coding every row
through the model, and `File<Model>Service`, composed over it, stores, serves and removes the bytes
with the record, checking the rule a delete needs and passing its guard into the plain delete's
`where`, and removes the bytes alone once a cascade took their rows, dying while one remains. A
service sees only the services of its own model below it and reaches the records only through the
plain one; another model's service stays a use case's, save in the last grouping of a module's
logic before a use case, a `<Verb><Model>Service` named for its verb, its main method that verb,
which use cases share: the chat's services of its jobs
([The chat's jobs in their services](#the-chats-jobs-in-their-services)). `AskChatService`, the
api's, takes a chat as read, checks a request to it (an ask of a busy chat; a retry of a newest
Run that is not failed, one in work included), stores what the jobs read, the user's message with
its queued Run in one transaction, or a retry's new Run of the failed Run's message, and sends the
jobs after the commit; the worker's, one per job, `ReplyChatService` and `TitleChatService`, write
other models' records of its module. The use cases of a request, an ask and a retry, keep the chat's
read scoped to the user.

```ts
// the bytes' service reads through the plain one, pipes the model's guard, passes it on, then
// removes the bytes once the row is gone
const remove = Effect.fn('FileOrderService.delete')(function* (where: OrderWhere) {
  yield* orders.getOne(where).pipe(ensureUnpaid)
  yield* orders.delete({ ...where, paidAt: null })
  yield* files.delete({ id: [where.id] })
})
```

- **Why:** a unit with one purpose has one reason to change, so a fix lands in one place and its
  tests stay its own; a new purpose added as a new unit leaves the tested units and their callers as
  they were. A composed unit's name says what it returns (the records as stored, or with their
  bytes), so a caller picks it by name. The plain `getMany` that hid the live check and the
  plain `delete` that hardcoded the unbound guard were rules edited into units named for records
  (the lesson in `roadmap.md`, entry 27); a Run's guarded write coded in two use cases was a step
  copied outside its service. For a model's services: the plain service returns the records as
  stored, and the bytes are stored and removed with their record in one service; a holder that
  needs the records alone (a list, a bind) holds no byte store. The row's coding and its guards
  have one owner, so a change of the model's row lands in the plain service alone. A request's
  rules, its writes and its jobs' sends sit in the api's service of the chat, and the jobs' handling
  in the worker's, so the busy check and the reply's send are written once for the ask and the
  retry, and neither flow holds a rule, a transaction or a send; each service holds what one
  process provides.
- **Sources:** the owner's principle (2026-11-19): wrap or compose, and change a unit only for a
  fix or an extension of its first intention, for models and utils as for services; Robert C.
  Martin, "each software module should have one and only one reason to change"
  ([The Single Responsibility Principle](https://blog.cleancoder.com/uncle-bob/2014/05/08/SingleReponsibilityPrinciple.html)),
  and "You should be able to extend the behavior of a system without having to modify that
  system"
  ([The Open Closed Principle](https://blog.cleancoder.com/uncle-bob/2014/05/12/TheOpenClosedPrinciple.html));
  Gamma et al., *Design Patterns* (1994): "Favor object composition over class inheritance", and
  the Decorator, also known as Wrapper; `repos/effect/LLMS.md`: "Build focused service layers,
  then compose them with `Layer.provide` and `Layer.provideMerge`";
  `.claude/rules/layering.md › Ports and domain services`; the owner's call in the design audit,
  the request in `AskChatService`; the owner's split of the chat's jobs at the queue, the api's
  half and the worker's (2026-11-21).
- **Rejected:** folding a unit into another for its line count or its single caller: neither says
  anything of the purpose the unit holds, and the fold edits a tested unit for a purpose not its
  own. One service per model: one unit with several reasons to change; the bytes in
  `<Model>Service` are two reasons to change in one unit, and a byte store every holder of the
  records depends on. A flag or an option added to a unit for one caller: the unit then serves
  two callers. The file
  service writing or reading the rows through the repository itself: a second owner of the row's
  coding. A request's rules called in the use cases' flow, its writes in a helper beside them: a
  rule's call and a transaction in a flow, the busy check in two flows. The request in
  `AskChatService` and the Run's job, its send and its handling, in a service of the Run: each use case
  that asks composed the request, the title's send and the reply's, and the new chat's rule sat in
  one of them. One service holding the request, the sends and the handling: the needs of two
  processes (the queue's sender, the assistants) in one unit, which each process provides whole.
- **Cost:** more units, files and layers, and longer provide lists; Gamma et al. name the price,
  "more objects (if fewer classes)". Whether a change extends a unit's purpose or adds another is
  judgement: review decides it, and the owner settles a dispute. For a model with bytes, two
  services and two layers; a handler of the model takes both; the plain `create` and `delete`
  have one caller, the file service, and `delete` only forwards to the repository with its span:
  they stay as the records' one owner, which a test that counts callers would delete. Each process
  provides the plain service once, below the file service, so a wrap of it reaches the file
  service and the plain service's other holders alike:
  [effect-services.md › Layers](../../.claude/rules/effect-services.md#layers). A rule over the
  reads that one flow applies is piped there, and a flow that forgets the pipe skips it; a rule
  every reader must apply is a service named for it. The plain `getMany` leaves an absent id out,
  so the rule the reader pipes names every absent id at once. The chat's jobs take three services
  and three Biome overrides, each of one process: `AskChatService`, the api's, admits `Transaction`
  and the queue file, `ReplyChatService`, the worker's, `Transaction` and the message's assistant,
  and `TitleChatService`, the worker's too, the chat's assistant alone; each takes other models'
  services, by its file's name.
- **Guarded by:** review, by `.claude/rules/composition.md`, which `make review-rules` prints for
  every TypeScript diff, and by `layering.md`; `noImportCycles` refuses a unit below that imports
  the one over it. Nothing refuses a fold, nor a service of another model, in a job's service or
  any other. The ask and reply services' Biome overrides admit of `@app-template/packages/db`
  only `Transaction`, the title service's none of it; of the infrastructure the ask service's
  admits only the queue file, the reply and title services' only their assistant's `.llm` file;
  the ask service's unit test pins each refusal before any write or job, and the api's e2e of an
  ask whose Run Postgres refuses keeps no message.
- **If reversed:** a new purpose edits the unit nearest to it, and each unit's tests gain cases for
  purposes not its own; the file methods fold into one `<Model>Service`, and every holder of the
  records depends on the byte store.
- **Revisit when:** a chain of wraps over one unit grows so long that a caller cannot tell from the
  names which unit holds a rule; or two units change together in every change, so they hold one
  purpose, which the owner then merges; or a rule over the reads must reach every reader, so a service
  named for it takes the pipe.

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

### Utils apart from models

A model's file holds its schemas and its rules, each naming a word of the glossary, a refusal or a
lifecycle move. Beside it, one `<model>.util.ts` per model that needs one holds the model's branded
id and the pure steps with no domain meaning, generic over their types, that the module's code
shares, in the file of the model that calls them (`isBlank` in `message.util.ts`); the module's one
id schema is built by `packages/schema`'s `buildIdSchema`, which every module's ids share. A util
file imports only `effect`, `packages/schema` and other util files, never a model, so a model takes
another model's id from its util file and no import cycle forms. A util that would only rename one
built-in call is not written; the built-in is called.

- **Why:** a reader of a model sees only the rules it states, where `Option` and `Array` plumbing
  beside them read as rules; a util generic over its types is tested once with plain values, and a
  rule over it only for what it adds. One util file per model, not per value: a reader finds a
  model's id and its helpers by the model's name, and the file kind for ids goes, since an id is
  the same leaf as a helper (it imports only `effect`, a model imports it). The domain is the
  most restricted importer, so a util there reaches every layer of its module.
- **Sources:** the owner's review of PR #39 (2026-11-19), "Create new type of files *.util or
  *.lib where we well hold utils like this", and the owner's review of commit 62e5aea2e5 (util
  files per model, not per value); `.claude/rules/composition.md`; `.claude/rules/effect.md`
  (write with effect's modules).
- **Rejected:** `*.lib.ts`: "lib" is on Package's avoid list. Utils in `packages/` from the start:
  the domain's guard would admit a package for helpers one module calls. A `utils.ts` per module: a
  file with no value in its name collects anything. A util file per value (`text.util.ts`,
  `id.util.ts`) and a separate `.id` file per aggregate: two kinds of leaf file for one role, and a
  value's name a reader has to guess. A rename of a built-in (`Effect.fromOption`): a second name
  for one call.
- **Cost:** a judgement per function, rule or util, which review makes and the owner settles; a
  helper two models share sits in one of them, the one that calls it first, and the other imports
  that util file. A util a second workspace needs moves into a package, and the domain's Biome
  override then admits that package by name, as it admits `@app-template/packages/schema` for
  `buildIdSchema`, which the contracts' override admits too (`UserId`).
- **Guarded by:** review, by `.claude/rules/naming.md › Files`; Biome's `noImportCycles` refuses
  a util that imports a model importing it back; nothing refuses a rule written in a util.
- **If reversed:** the utils go back into the model files beside the rules they serve, and each
  aggregate's ids back into an `.id` file.
- **Revisit when:** a util is needed outside one module, or a util starts to import a model, so
  it was a rule.

### A Run's moves in their own service

`MoveRunService`, layered over `RunService`, holds a Run's status moves: `start`, `complete`,
`fail` and `failActive`, each the model's transition (`startRun`, `completeRun`, `failRun`, each
named for the move it makes, not the status it reaches, as the started Run's stored status stays
`generating`) then `RunService.update` under the status the Run was read in, through one helper.
`complete` and `fail` take the Run their caller holds; `start` and `failActive` take the user's
message, the one key the worker holds, and read its active Run as it stands now through
`RunService.getActive`, `ActiveRunNotFoundError` when it has none. `start`, the job's first move,
`queued` to `generating`, pipes that read through the model's `ensureRunUnstarted`,
`RunStartedError` for a Run some worker started; `fail` and `failActive` keep the full text of
the `Cause` they are given. The api fails the Run it stored and sent, by its id: a refused send's
`fail(run, cause)`, written under `queued`, so a Run a worker settled meanwhile, as SQS took the
job after all, dies on the write's guard and the request responds with `500`; it never reads,
fails or returns another Run of the message. The worker, which holds the message alone, fails by
it: the reply's tail calls `failActive`. `RunService` stays the plain write under a caller's
`where`, and the chat's job services move a Run through `MoveRunService`, never through a
transition and an update of their own. A move the model's table refuses dies with
`RunStatusInvalidError`: every caller moves a Run it has just read or moved, so a refusal is a
bug, and a race dies on the write's guard instead. A reply writes the Run twice, `generating`
then `done` (or `failed`), and a client polling it sees only `queued`, `generating` and the end.

- **Why:** the six moves of the use cases composed the same two calls with the same guard; in one
  service the guard on the status read is written once, and a move can no longer forget it. The
  api holds the Run it created and its id, so it fails exactly that Run, and no request answers
  with a Run it did not create; the worker's tail never sees the Run the body read, so
  `failActive` reads its own, and no caller can hand it a stale Run. That a job takes only an
  unstarted Run is a rule of the Run, so the service that moves it calls it, as `failActive` reads
  its own Run, and `ReplyChatService.reply`, which does the job's work, calls `start`
  ([The chat's jobs in their services](#the-chats-jobs-in-their-services)). One started status: a
  status of its own before `generating` lasted one read of the chat's history, and no code branched
  on it.
- **Sources:** the owner's call in the design audit;
  [Composition: wrap or compose](#composition-wrap-or-compose); the owner's call of one class per
  not-found and the message as the worker's one key (2026-11-21), on the design audit's research
  into reason-shaped errors; the owner's refusal, for the api, of a refused send that fails a
  later retry's Run (2026-11-21).
- **Rejected:** the moves on `RunService` itself: the plain service would know the transitions.
  Each caller composing the transition and the update: the guard repeated at six sites, where
  one could drop it. A `RunService.fail` alone: one move of four out of the service that holds
  the rest. The api failing by the message: a refusal that arrives after SQS took the job, a
  worker failed the Run and the user retried failed the retry's Run, and the request responded
  with it. The api's refused send on a settled Run returning the Run as the request created it:
  the write's miss is a defect the code cannot tell from a chat deleted meanwhile, and catching
  it hides a bug. The worker failing by the Run its body read: a second tail on the steps after
  the read ([A Run's job on interrupt and on two deliveries](#a-runs-job-on-interrupt-and-on-two-deliveries)).
  The job's read and `ensureRunUnstarted` in the use case: a rule's call in a flow. The check
  folded into `startRun`: a transition of two conditions, against the model's pieces of one
  each. The refusal as a typed failure: it rode six signatures, no caller could raise it, and
  each one turned it into a defect. A started status for the history's read alone: a status, a
  move, a method and a write per reply for one query. One `fail` taking the Run's id or its user
  message: a union parameter, and one `RunNotFoundError` whose two optional keys named either
  read, which the api's `404` for a Run by id then carried as a `userMessageId` it never sends.
  Two methods named for their key (`failById`, `failByMessage`): `failActive` says which Run of
  the message it fails, as `getActive` reads it. One error with a `reason` per read: no caller
  tells the two apart, and a wrapper is a second name for each.
- **Cost:** a second service and layer for the Run; the processes and the test layer provide
  `MoveRunService` over `RunService`. A refused send whose job SQS took after all, once a worker
  settled the Run, responds with `500`. A later stage the user should see before `generating`
  (reading a chat's files) adds its status back: one value of `runStatuses`, one row of the
  moves' table, one move, and a regenerated `init`.
- **Guarded by:** `MoveRunService`'s unit test: each move writes under the status read, a
  refused move dies and writes nothing, `start` of a started Run fails `RunStartedError`,
  `start` and `failActive` read the active Run of their message, and of a message with none fail
  `ActiveRunNotFoundError`; `AskChatService`'s, a refused send that fails the Run it stored by its
  id, reading no Run, and one whose Run a worker settled that dies on the guard, failing no later
  Run; the model's test of `ensureRunUnstarted`; review, by
  `.claude/rules/layering.md › Ports and domain services`.
- **If reversed:** each use case composes the transition and `RunService.update` again.
- **Revisit when:** a move needs a guard other than the status read and the model's rule.

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
`ANTHROPIC_API_KEY`, a 10-minute wait for a byte) and holds the app's one call policy,
`askModel` (the retries, the failure mapping and the finish-reason check), with its one final
error, `LlmError`, behind an entry of its own, `@app-template/kernel/llm/error`, that loads no
client. Over it `chat`'s `infrastructure/`
holds one service per job, each a `Context.Service` with its `static layer`: `MessageAssistant`
answers the chat's next message from its history, `ChatAssistant` the chat's title from its
opening text. Each builds its one model with `AnthropicLanguageModel.make`, of
`LLM_REPLY_MODEL` or `LLM_TITLE_MODEL`, beside its prompt and request settings, pipes
`askModel` and fails with its `LlmError`. The domain keeps only what they take and return
(`MessageFields`, `AssistantReply`), and a failed Run keeps the error's full text
([A failed Run keeps its text](#a-failed-run-keeps-its-text)); no port stands in
front of the services. A use case, or the chat's worker service of a job, yields the assistant it
needs, a unit test swaps that service's layer, and the suite builds both layers over a recording
client.

- **Why:** the two jobs change for different reasons (a reply's prompt, history and cache; a
  title's schema and low effort) and are called by different use cases, so one service holding
  both gave each caller a method it never uses and each fake a branch for it. With one
  implementation each, a port in `domain/` and an adapter constant only restated the service's
  shape: the class with its `layer` is the contract, and `Layer.succeed` of the same class is
  the double. The call policy is the app's for any model call, not chat's, so it lives once
  beside the client and a second module that asks a model pipes the same function; its error
  goes with it, so every caller names the same outcome and no module restates it. One error, not
  one per way the answer ended: no code branches on which, so a refusal reads from the cause's
  text (`finish reason content-filter`), as every other end does. The
  kernel configures the client as it does Postgres (`PgClientFromConfig`), and the services,
  which hold Anthropic's request settings anyway, build their models where they use them; the
  client stays a leaf the worker provides once.
- **Sources:** `docs/knowledge/ai.md`; `.claude/rules/effect-services.md` (a service's layers
  are statics, the client a leaf left open); `.claude/rules/composition.md` (one purpose per unit);
  the roadmap's `bedrock-provider`.
- **Rejected:** one `Assistant` port with `reply` and `proposeTitle` and one adapter
  (`AssistantLlmFromConfig`): two purposes in one unit, an interface with one implementation, and a
  fake scripted per method. A base class or a shared service holding the retries: an
  inheritance or a third service for what one function does. Each service closing the client
  in its `layer`: a leaf the rule leaves open, provided twice. A builder in `kernel/llm` taking
  a purpose: its parameter was typed by Anthropic's request settings, so the services held one
  provider's settings all the same. The module's own errors passed to `askModel` as two
  constructors: every module that asks a model would declare the same error again and a mapping
  for it, and the domain's guard, which admits no kernel error, would gain nothing by it. Each
  service mapping `AiError` with its own `mapError`: the retry and finish-reason policy copied per
  service. A `packages/` workspace for the policy: a tool for every app for some 40 lines of this
  app's policy.
- **Cost:** the use cases' guard admits `@app-template/kernel/llm/error`, for names matching
  `Llm…Error` only, so a use case names a kernel error; the domain's admits none. The use
  cases import a class whose file names the provider's package, so loading them loads
  `@effect/ai-anthropic`; a second provider adds a `layer<Variant>` per service, not a second
  adapter of one port. `@effect/ai-anthropic` is a runtime dependency of the `application`
  workspace and of the kernel. An operator tells a refusal from any other end only by the
  cause's text, not by a tag. No test checks the 10-minute wait, nor a request setting beside
  the model.
- **Guarded by:** the rows of a module's `domain/`, `services/` and `infrastructure/` and of
  `use-cases` in [architecture.md › Dependency rules](architecture.md#dependency-rules) (the
  domain and the use cases take of `kernel/llm` only `/error`'s errors, by name; no service but
  `ReplyChatService` and `TitleChatService` import an `.llm` file, each its own, so only they or a
  use case reach the assistants);
  the assistants' suite over a recording client.
- **If reversed:** a port per job comes back in `domain/` with an adapter constant each that
  only builds the same shape, or one port of two methods with a fake branch per method; errors
  back in a module mean the module's own pair and a mapping for `askModel` to take.
- **Revisit when:** a second provider lands, or a domain service other than a job's, which may
  not import the infrastructure, needs an assistant: then a port in `domain/` returns for that
  call.

### The data at the centre

`kernel/data` holds every store (tables, relations, the bucket's objects) and its
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
`MessageEntity` nest their Run. The domain's records are models, and a model is the
codec of its own row: its encoded side is the row of its one store, the rules read its type side
only, and its callers code its row with the generic `encodeWith` and `decodeWith`, with
no mapper per model. A second stored form of a model brings back a mapper that lays the model's
schemas over that store's columns.

- **Why:** a reader tells the data's view from the domain's by the name alone, and a table from its
  entity by the file; tables that import only tables leave the entities free to nest one another
  without an import cycle. A stored field is declared in the table and the model, which the wire
  takes as it is, with no third list in a mapper.
- **Sources:** the ticket's naming survey; `.claude/rules/naming.md`.
- **Rejected:** a flat entity beside a second one with its Run: a second name for the one
  shape every read returns. The service composing a chat from two repositories: two queries and a
  grouping where one relational read serves. A mapper that lays the model's schemas over the
  columns (`<Model>FromEntity`): a second list of the model's fields. A mapper that only names
  the model's codec pair (`encode<Model>`, `decode<Model>`): a pass-through over one generic call,
  which the deletion test removes.
- **Cost:** a store has two files where it had one. A model's declaration says how its row stores
  a value (`null`, a `Date`), and a column the model lacks is dropped by a read. Each call names
  its codec and the read's shape (`decodeWith(Schema.Option(<Model>))`), and a write encoded
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
that misses the row it names dies, so the loser of a race writes nothing and rolls back whole.

- **Why:** the checks run as pure functions over a plain read, before every write; a lock would
  tie the check to the transaction and hold rows while other work runs.
- **Sources:** [database.md › Guards](database.md#guards); `.claude/rules/layering.md ›
  Concurrency`.
- **Rejected:** a `FOR UPDATE` read before the check: the loser would wait and then get its
  domain error, but the read would carry an option that changes its contract.
- **Cost:** a loser that read before the winner committed dies with a `500`, not a typed refusal; a
  loser that reads after it gets its `409`.
- **Guarded by:** the repositories' writes die on a missed row, each with its e2e; the e2e race
  of two asks of one chat asserts one stored, one refused.
- **If reversed:** the reads take `forUpdate` again, and a check whose loser must get a domain
  error waits on the winner's commit.
- **Revisit when:** a race's `500` reaches users often enough to need its own refusal.

### Reads in creation order

A read of a chat's messages returns them in creation order, `createdAt` then `id`. The chat list
alone returns newest first.

- **Why:** one order for a chat's contents, written once, in each repository's `ORDER BY`.
- **Sources:** [database.md › Schema and entity files](database.md#schema-and-entity-files) (the
  index that serves it).
- **Rejected:** an order a caller passes: a second order for one read, lost again when the chat is
  read back.
- **Cost:** messages created in one millisecond come back by id, not by the order they were written.
- **Guarded by:** the repositories' e2e read rows created out of id order in creation order.
- **If reversed:** each read takes its order from its caller.
- **Revisit when:** a client needs a chat's contents in an order it chooses.

### Status from the newest Run

A chat has no status column: the chat model's `buildChatStatus` derives it from the chat's newest
Run, which every read of a chat nests. Any other value another table implies is a column the
transactions that change it move (`.claude/rules/repositories.md › What is stored`).

- **Why:** the Run holds the status already; a column would be its second copy, written by each
  of the Run's moves (its creation, a retry, `generating`, `done`, `failed`) in that
  move's transaction, and one forgotten write lets the two drift. The derived one costs no query,
  since the read nests the Run: the api and the rules (`ensureChatNotBusy`) take that Run alone,
  not the chat, and a client derives it the same way from the Run it reads.
- **Sources:** the owner's choice, in the Knowledge of
  [the reply-run lab](../tickets/2026-11-09-1206_reply-run/lab.md).
- **Rejected:** a `chats.status` column moved by every Run move: a write in each and a drift to
  keep a value that one row already gives.
- **Cost:** a query over chats by status joins each chat's newest Run, and a read that needs the
  status has to nest that Run.
- **Guarded by:** review, by `.claude/rules/repositories.md`; nothing mechanical.
- **If reversed:** a migration adds the column, each Run move writes it in its transaction, and
  `buildChatStatus` moves from the reads to the writes.
- **Revisit when:** a read lists or filters chats by status, or reads a chat's status without its
  Run.

### Clients from the context

The data layer takes its clients from the context: `Db` needs `PgClient` and `FileRepository`
needs `S3Bucket`; `kernel/postgres` (`PgClientFromConfig`, the migrate entry) and `kernel/aws`
(`S3BucketFromConfig`) build them from config; the processes provide those their repositories
need (none provides `S3Bucket` while no module stores files), the data's e2e `DbTest` and
`AwsTest`.

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
only `download` reads the bytes, returning `DownloadedFileEntity`, the entity with them. The data
layer declares the key; `kernel/aws/resources` declares the bucket's name and lifecycle, which
`deployment` reads.

- **Why:** a caller reads and writes through one kind of repository, whichever store holds the
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
  file repository's e2e; the `deployment` row of
  [architecture.md › Dependency rules](architecture.md#dependency-rules).
- **If reversed:** the port goes back into `chat`'s `domain/` with its adapter in
  `infrastructure/`, and a second module needing files imports chat.
- **Revisit when:** the redesign of attachments, or `assistant-files`, needs files outside a chat.

### Attachments removed

The app holds no attachments: a message is its text alone. Removed in every ring: the api's
`attachments` routes and the ask's `attachmentIds`, chat's `Attachment` model with its rules,
errors and two services, the reply's file parts, `Chat.attachments` and `Message.attachments`, and
the data layer's `attachments` table with its entity, repository and relations, gone from the one
`init` migration. What stays is the generic core they were built on: `FileEntity`, `FileRepository`
and `buildFileKey` in `kernel/data/file`, its `FileRepositoryTest` fake; the kernel's AWS clients
with `S3BucketFromConfig`; the bucket in `kernel/aws/resources`, its provisioning in
`deployment/aws/storage.ts` and MiniStack; `packages/s3` and `packages/aws`. The bucket keeps its
name `attachments` and the key prefix `attachments/`, so a redesign starts from a store that works
without renaming provisioned resources. No app wires the files today.

- **Why:** the owner's call on the design audit of 2026-11-19: the attachments' design (a library,
  copies per ask, bytes by source) is to be rethought, and code kept for a design that changes
  is read, tested and reviewed for nothing; the store underneath is generic and proven by its
  e2e.
- **Sources:** the owner's word on the design audit
  (<https://claude.ai/artifact/WJkD7rXKsH7caQ71p1qUS2>); the roadmap's `shared-files` entry,
  paused.
- **Rejected:** keeping the attachments behind a flag: dead code with live tests. Removing the
  file core too: a redesign would rebuild the S3 streaming, signing and provisioning that already
  work. Renaming the bucket and the prefix now: a provisioned resource renamed for a feature not
  yet designed.
- **Cost:** a local database rebuilds by `make reset && make up` for the regenerated `init`; the
  bucket's name and key prefix still say "attachments" with no attachment behind them.
- **Guarded by:** review; `make migration-check` holds the schema to the tables.
- **If reversed:** the commits that removed them revert in order, and the `init` migration is
  regenerated with the table again.
- **Revisit when:** the attachments' redesign starts; it names the bucket and the prefix anew.

### Jobs as queue messages

A job is a queue message, and no table holds it: the work it hands over keeps its own record
(the Run, the chat's title), which the worker reads to handle it once, to settle a Run whose worker
died and to write a failure. `QueueSender.send` encodes the job by its definition; a use case sends
it after its commit, so every delivery finds its record. Each job goes through its `send<Job>` in
its module's infrastructure, in the file of its queue's definition, which only sends it and logs a
send SQS refuses. A job hands its worker one piece of work, as a command message does in
messaging, and is named as one: `<Verb><Object>` in the glossary's words for the work it hands
over, never after a method, its queue or one step of the work; its queue, its `send<Job>` and the
use case that ends it take its name. The chat's two are `ReplyToMessage { messageId }`, on
`reply-to-message`, sent by `sendReplyToMessage` and ended by `replyToMessage`, and
`TitleChat { chatId }`, on `title-chat`, sent by `sendTitleChat` and ended by `titleChat`. The
reply's names the user's message and starts its active Run, which the unique index on a chat's
active Run keeps to one; what a job that names no one Run costs: [A Run's job on interrupt and on
two deliveries](#a-runs-job-on-interrupt-and-on-two-deliveries). The title's names the chat, whose
first message the worker reads. The reply's send returns its
`QueueError`, and `AskChatService`, the api's half, sends it from both its methods after their
commit and fails the Run through `MoveRunService.fail`, with the error's full text as its failure;
the request responds with `202` and that failed Run. The send and that failure run
uninterruptibly, so a client that aborts mid-send still leaves the Run sent or failed. The title's
send only logs it, as its work has no record to settle. Which services a Run has and over which:
[layering.md › Ports and domain services](../../.claude/rules/layering.md#ports-and-domain-services);
who does each job's work: [The chat's jobs in their services](#the-chats-jobs-in-their-services).

- **Why:** every duty a job's row held already sits on the work's record; a row beside it is a
  second status for one piece of work. The send after the commit needs no relay and no sweep, and
  a missing record means a deleted chat. A refused send is the one cause of a stuck reply a
  handler can catch, so its Run fails at once and the user sees the failure with its retry. The
  send connects to the environment, so it sits in infrastructure, in its queue's file, as a send
  has no use apart from its queue. Each unit knows only its own: the send its queue,
  `MoveRunService` the move to `failed` and its write, `AskChatService` the pair, a step its two
  methods share, which lives once there
  ([Composition: wrap or compose](#composition-wrap-or-compose)), as a use case never calls
  another. A port for the send would put an interface and a layer in front of one call. A
  command's name belongs to its receiver's vocabulary of the work (NServiceBus: "verb-noun
  sequence, following the tell style"), here the glossary's, so the job and the service method
  that runs it share a verb because both take the glossary's word, not because one copies the
  other; the class never rides on the wire (the body is its fields, the queue routes it), so its
  name costs no deployed state.
- **Sources:** reply-run's review of what each reader of `jobs` used it for, in
  [the reply-run lab](../tickets/2026-11-09-1206_reply-run/lab.md) (L2); the design audit's
  research on naming a queue's message (EIP's Command, Document and Event Messages, NServiceBus,
  MassTransit, the job frameworks) and the owner's call of the names (2026-11-21).
- **Rejected:** a table of jobs in the data layer, a row per job beside its work's record: a second
  status for one piece of work, written in the same transaction. The send last inside the
  transaction: SQS may deliver it before the commit shows the record, and the worker skips it as a
  deleted chat's, leaving the reply queued. A stuck Run that a retry may take after an age: a
  rule by time, and a Run that reads queued while it is lost. A callback into the send that
  settles its refusal: infrastructure would decide the refusal's outcome and depend on the Run.
  The settlement as a `MoveRunService` method: the moves would know the queue. A function beside
  the use cases that both call: a use case calling another. A port the service calls, adapted
  in infrastructure: an interface and a layer for one call. The settlement
  copied into each use case that sends the reply: one step in two places, where a fix must land
  in both. A sweep resending unsent work: a schedule and a route of its own, and a reply
  up to a minute late. Retries with a delay per attempt: a failed reply the user waits on through
  every attempt, and code that counts them. The title's send inline in its use case: the send's
  policy, its log and its annotations in a flow, and a second form of the sending rule beside the
  reply's send. A domain error wrapping `QueueError` and a `503` for a refused reply: a second
  name for one failure, which the Run already holds, and a retry is the client's next step either
  way. Job names that follow the service methods (`ReplyMessage`, `ReplyTitle`): a method's
  rename would ripple into the class, the send, the use case and the queue, and `ReplyMessage`
  reads as a noun, a message holding a reply. The old `GenerateAssistantMessage` and
  `GenerateChatTitle`: one act under two verbs, `generate` in the job and `reply` in the service
  that runs it, and a name for one step of the work, the model's call. An event
  (`UserMessageCreated`): the new chat's rule would move to the worker or ride as a flag, one event
  for two consumers needs a fan-out, and a retry is not that fact.
- **Cost:** a process that dies between the commit and the send leaves the Run queued and its
  chat busy ([roadmap.md › Later](roadmap.md#later)); a client's abort before the send:
  [A Run's job on interrupt and on two deliveries](#a-runs-job-on-interrupt-and-on-two-deliveries).
  A refused send responds with `202`, so a client reads the failure from the Run's status, not
  the response's. A domain service now reaches its module's queue file, so the ask service's
  guard admits that one file of infrastructure; a send inside its transaction would send before
  the commit, which no check refuses: the rule in `.claude/rules/layering.md` and review hold
  it. A queue's name changes only as a new queue, as SQS renames none: each stack's next
  `make up` replaces it, and what the old one held is lost.
- **Guarded by:** the `QueueSender` e2e; the unit tests of the sends, of `AskChatService` and of
  the create flow; the ask service's Biome override, which admits of its infrastructure only
  `#*/infrastructure/*.queue`; the `infrastructure/` and `use-cases` rows of
  [architecture.md › Dependency rules](architecture.md#dependency-rules).
- **If reversed:** a table of jobs and its repository in the data layer, and a sender over both.
- **Revisit when:** the logs show replies stuck by a process that died before its send.

### The chat's jobs in their services

A chat's jobs are split at the queue: `AskChatService`, in the api, stores a request and sends its
jobs after the commit ([Jobs as queue messages](#jobs-as-queue-messages)), and the worker does each
one's work in a service of its own. Each is the last grouping of the module's logic before a use
case: its class is named for its verb and its main method repeats that verb, any other method named
for its own act in the model's words. The two sides meet by one grammar: the api's private step
`ask<Verb>` sends the job `<Verb><Object>`, and the worker's `<Verb><Model>Service.<verb>` does that
work.

```text
api:    AskChatService.ask ──askTitle──▶ TitleChat ──────▶ titleChat ──────▶ TitleChatService.title
                           └─askReply──▶ ReplyToMessage ─▶ replyToMessage ─▶ ReplyChatService.reply
        AskChatService.retry ─askReply─▶ (the same)
```

`ReplyChatService.reply` does the reply's job's work, given the user's message the job names:
`MoveRunService.start` moves that message's active Run to `generating` if unstarted, then the
chat's history, the assistant's reply, and the assistant's message with the Run's `done` in one
transaction; one tail on the whole function fails the message's active Run as it stands now on
whatever ends it, `start`'s refusal included. A Run some worker started fails `RunStartedError`,
whose text says its worker stopped, and is failed with it; a message with no active Run fails
`ActiveRunNotFoundError`, unwritten, as the tail finds nothing to fail. `TitleChatService.title`
does the title's job's work, given the chat the job names: the chat's first message, the assistant's
title, and the title written while the chat is untitled, so a rename by the user wins; a chat with
no message fails `ChatNotFoundError`, as a message leaves only with its chat. Each job's use case
ends the job in one tail: the reply's skips a Run settled or gone, ends on a started Run and on the
assistant's error, which the Run already holds, logging each end once with its cause, an interrupt
included; the title's skips a chat gone or titled and logs the assistant's error; a defect, a
refused move's included, is the queue consumer's to log. `ReplyChatService` takes `Transaction`,
the message's assistant and the services of the module's other models, for the records the reply
writes; `TitleChatService` the chat's assistant and those services, as its one write needs no
transaction; `AskChatService` takes `Transaction`, its queue file and those services, for the
request and its sends ([Composition: wrap or compose](#composition-wrap-or-compose)).

- **Why:** each job's run sits in one service: the rule a job keeps (an unstarted Run only), the
  moves it makes and the handler that fails the Run on what ends the answer, the rule's refusal
  included, so a dead worker's Run is failed inside the service that holds the rule. The service
  reports each refusal as a typed error, so the job's end, a policy of the job (skip, end, die),
  and every log of it sit in the use case's one tail, and the service logs nothing. A Run the
  handler finds settled or gone has nothing to fail, so the answer's own failure stands; any
  other refusal of the handler dies. The split follows the processes: what the api provides (the
  queue's sender) is the ask service's alone, what the worker provides (the assistants) the
  worker's services', so each process builds only its side, and each service's guard admits only
  its own infrastructure. Each worker service is functional, one purpose: the reply's and the
  title's services share only `MessageService`, and their callers and reasons to change (the Run's
  life, the title's policy) are disjoint. `AskChatService`'s two methods share the reply's send
  and its settlement and the Run's create, so one unit holds them. The repeated verb shows the
  tier in every call (`askChat.ask`, `replyChat.reply`) with no word, suffix or folder of its own.
- **Sources:** the owner's call in the design audit, the reply in its job's service; the owner's
  split at the queue (2026-11-21); the owner's names, `AskChatService { ask, retry }`,
  `ReplyChatService { reply }` and `TitleChatService { title }` (2026-11-21), on the design
  audit's research into naming this tier (Graça's application service under a command handler,
  UML's included use case, the interactor gem's interactors, Phoenix's context functions).
- **Rejected:** the reply in its use case, the service only sending: the Run's rule and moves
  composed in a flow, and its job's statuses in two units. The skip logged in the service,
  `reply` then failing only with the assistant's errors: the job's end split over two units,
  each with its logs. The assistant's errors settled in the service: the use case would hold
  nothing, and the job's end is the job's policy. A port in `domain/` for the assistants the
  service calls: an interface with one implementation for one caller, where its own override
  admits the `.llm` file by name. The title's run left in its use case: one of the chat's two
  jobs read and wrote records in a flow. One service sending the jobs and doing their work: each process
  would provide the other's requirement, and one guard would admit both the queue file and the
  `.llm` files. One worker service for both jobs, `ReplyChatService { replyMessage, replyTitle }`:
  temporal cohesion, two units under one name, and a Reply that titles, which the glossary's
  Reply excludes. `askMessage` and `askRetryMessage`: "ask a message", and no retry message
  exists. `askAgain` for the retry: the model's word is retry (`ensureRunRetryable`,
  `RunNotRetryableError`, `retryRun`). A word or a file suffix for the tier (application service,
  act, orchestrator): the glossary avoids or holds each, and a suffix's glob would widen each
  service's override to the others' infrastructure.
- **Cost:** three services and three Biome overrides, each of one process. `ReplyChatService` comes
  near a use case in reach (a transaction, an assistant, other models' services): its own Biome
  override admits it by its path (`reply-chat.service.ts`), and review keeps it to the reply's job;
  each worker service names its assistant's errors through its type, as a service imports no part of
  the kernel. `reply` requires the message's assistant and `title` the chat's, which the worker
  provides, so the module's test layer builds without either. A service holding its own transaction
  cannot join a caller's ([roadmap.md › Later](roadmap.md#later)).
- **Guarded by:** the unit tests of `ReplyChatService`, of `TitleChatService` and of each job's
  end and its logs in its use case; the reply service's Biome override, which adds to the
  services' the message's assistant's `.llm` file and of `@app-template/packages/db` only
  `Transaction`; the title service's, which adds the chat's assistant's `.llm` file alone; the
  ask service's, which adds the queue file and `Transaction` alone.
- **If reversed:** the Run's rule and moves go back into the job's use case, which then fails the
  Run outside the service that holds the rule, and the title's reads and write go back into
  theirs.
- **Revisit when:** a job of the chat is handled in the api, or one the worker sends, so a side would
  need the other process's requirement.

### A Run's job on interrupt and on two deliveries

What a Run's job accepts when it is cut short or handled twice. The tail on the whole of
`ReplyChatService.reply` fails the Run on an interrupt as on any failure, so a worker
interrupted while the job reads its Run or while the assistant answers leaves the Run `failed`,
not started; the reply's send in `AskChatService` and a refused send's failure run
uninterruptibly. A client that
aborts while the Run's write commits or the title's send runs ends the flow before the reply's
send starts, and the Run stays queued. Two deliveries at the same instant both read the Run
queued; the loser's guarded `generating` write dies and its handler fails the Run the winner works
on, so the winner's next write dies, the reply is lost and the user retries. A Run settled or
deleted under the reply is left as it is, so the job ends on the answer's own failure. The job
names the user's message, not a Run, so a delivery starts whichever Run of it is active then: a
failed Run's job delivered again after the user's retry starts the retry's Run, whose own job
then finds it started and fails it with `RunStartedError`, and the user retries once more. The
tail reads the Run it fails by the message too, so a reply that dies after such a delivery
failed its Run and the user retried fails the retry's Run. The api fails a refused send's Run by
its id instead, so a refusal that arrives after SQS took the job anyway and a worker settled the
Run dies on the write's guard and fails no later Run
([A Run's moves in their own service](#a-runs-moves-in-their-own-service)).

- **Why:** the handler sits on the whole function, so no failure or interrupt of the reply leaves
  the Run started for the next delivery, and the reply reads as if nothing failed. A race of two
  deliveries is decided by the guard in the write, with no lock in the process
  ([Guards in the write, no lock](#guards-in-the-write-no-lock)).
- **Sources:** the owner's call in the design audit, the reply in its job's service; the owner keeps
  the abort's window as a cost (2026-11-20, [roadmap.md › Later](roadmap.md#later)); the owner's
  call that the reply's job carries the user's message, as the title's then did, and accepts what
  a second delivery then costs (2026-11-21); the owner's refusal of that cost for the api's
  refused send, which fails its Run by its id (2026-11-21).
- **Rejected:** the handler after the first move: an interrupt between its write and the handler
  left the Run started until the next delivery, up to the queue's visibility timeout later, and
  the use case failed a started Run outside the service that holds the rule. The job carrying the
  Run's id: a second delivery found its own Run settled and was skipped, but the reply to a
  message then takes a Run's id, and the method's name and its parameter disagree. The tail
  failing by the Run's id once the body has read it: a second tail on the steps after the read,
  and an uninterruptible hand-off between the two, for the same window of a second delivery.
- **Cost:** a client that aborts while the Run's write commits or the title's send runs leaves the
  Run queued and its chat busy ([roadmap.md › Later](roadmap.md#later)). Two deliveries at the
  same instant lose the reply, and the user retries. A failed Run's job delivered again after a
  retry fails the retry's Run, and the user retries again. A model's error on a Run
  whose chat was deleted meanwhile warns like any other, with no sign the Run was gone.
- **Guarded by:** the unit tests of `AskChatService`, one interrupted mid-send, and of
  `ReplyChatService`, one while the assistant answers, one while the job reads its Run, one
  losing the `generating` write to a rival, one of a failed Run's job delivered again after its
  retry, and `AskChatService`'s of a refused send whose Run a worker settled, which fails no
  later Run; the job's use case's test of an interrupt's end and its log.
- **If reversed:** the handler after the first move again: an interrupted reply leaves its Run
  started until the next delivery fails it.
- **Revisit when:** the logs show replies lost to two deliveries at once, retries failed as
  started, or Runs left queued by an abort.

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
by the guard that can see it: the linker and `tsc -b` see a workspace but no part inside a
folder, since `kernel/`, `packages/` and `application/` are one workspace and one
`tsconfig.json` project each; `.misc/lint/biome.base.json` has one override per layer, never
per part, and the plugin reads the part and the ring from the file's path. Which guard refuses
what:
[architecture.md › Dependency rules](architecture.md#dependency-rules) and
[Boundary guards](architecture.md#boundary-guards).

- **Why:** every guard is configuration of a tool the repo has; a fitness test is code to keep,
  and drifts. A list per part repeated what the linker already refused and grew past what a
  reader checks whole; a rule held once, by the one tool that can, stays read. Biome's message
  names its decision, which TS2307 never could, so it keeps the boundaries whose breach is
  costly: the browser's, the kernel's boundary in a service, the data layer.
- **Sources:** the guide's "Add fitness functions in CI … turn violations into failing builds"
  ([styles/modular-monolith](https://software-architecture-guild.com/guide/architecture/styles/modular-monolith/));
  in modular-monolith-with-ddd an architecture test checks the wrong assembly (research); Biome's
  GritQL plugins, which read `$filename`.
- **Rejected:** a module-graph test: test code for a rule review can hold. dependency-cruiser: it
  needs a TypeScript parser the repo lacks. A list per part, `@app-template/**` refused but for
  each part below it: an override per part and per test folder, since Biome replaces an earlier
  override's options instead of merging them, most of them repeating TS2307. A `tsconfig.json`
  project per part beside a list: its `references` would repeat the list, one rule in two places.
- **Cost:** what only review refuses, the lists in `modules.md` and `layering.md`, passes
  `make check` when review misses it; `noImportCycles` refuses a part importing one above it only
  where a cycle of value imports forms, and `make test-unit` e2e support in a unit test only where
  the test builds it, since it starts no database. A refusal by TS2307 names no decision. `tsc -b`
  no longer refuses a cycle between the parts of one folder (TS6202). Grit gives the plugin only the
  absolute path, so it names the part by the last `application/`, `kernel/` or `packages/` folder on
  it: a folder of that name inside a part misreads its files, and a checkout under one
  (`~/packages/<repo>/`) misreads every file outside the three folders, refusing an app's own
  `#<app>/…`; the rules of the apps and `deployment` read the last ring folder on it the same way.
- **Guarded by:** `make check` runs them all; the Rules reviewer reads the rules that bind
  the diff (`make review-rules`); `.misc/lint/biome.base.json` and its GritQL plugins beside
  it, `biome-imports.grit` for the imports and `biome-effect.grit` for the Effect style a
  type-blind reader can see; the Effect language service's `overrides` in `tsconfig.base.json`,
  for the ambient globals `application/` bans.
- **If reversed:** a test beside the rule, kept in step with every new module; a list per part
  again, or a folder split into a workspace per part
  ([Imports through subpaths](#imports-through-subpaths)), its dependencies in place of the lists.
- **Revisit when:** review misses a violation the rule names, or a tool gains the check.

### Imports through subpaths

A file imports its own part's files through the workspace's `#…` subpaths, never a relative path,
and another part only through that part's entry, even inside one workspace. A part of the
kernel, of `packages/` or of `application/` is imported by its folder: each of the three folders
is one workspace with one export per part, its `index.ts`, and its test support. The apps keep
their package names. The forms, with examples:
[architecture.md › Imports](architecture.md#imports-workspace-vs-app-template).

- **Why:** an import tells where its code lives, and one entry per part is all a caller must know;
  a subpath inside a workspace names the part and the layer it reaches, so a Biome override can
  refuse it by pattern, while a relative path hides the layer and can reach into another
  workspace's files.
- **Sources:** `.claude/rules/naming.md`; npm names allow one `/` after the scope, so a folder's
  path is a subpath of its folder's workspace; `tsc -b`'s TS6059 and TS6307 on a path into an
  unreferenced project.
- **Rejected:** relative paths inside a layer only: one more rule for a reader to apply, and no
  pattern tells a layer's own folder from the next. A workspace per part with `paths` aliases
  in `tsconfig.base.json`: an alias bypasses the linker entirely and needs a setting in every
  tool. A subpath per store or per layer (`/data/<store>`, `/chat/domain`): a caller must know
  the part's inside. A `tsconfig.json` project per module: its `references` would repeat the
  Biome overrides, one rule in two places.
- **Cost:** every workspace declares its `imports`; one manifest declares every part's
  dependencies, so the linker tells the folders apart but not one part from another; a part's
  one entry opens it whole, so a layer that may take only some of it (the inventory of `/aws`,
  the stores of `/data`, a module's contract) is held by the names it imports; `application/`
  and `packages/` are one `tsconfig.json` project each, as the kernel is, so `tsc -b` no longer
  refuses an import between their parts ([Guards are configuration](#guards-are-configuration)
  says what does).
- **Guarded by:** `biome-imports.grit` and the overrides' `importNamePattern`, in the forms
  [architecture.md › Boundary guards](architecture.md#boundary-guards) lists.
- **If reversed:** a folder splits into a workspace per part, each with its manifest, and the
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
test app `apps/e2e`. Test support lives with the part that uses it. The layout, the entries and
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
  it, behind a barrel every part imports. The use cases' e2e in `application`, a use case called on
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
  call of the use case. A unit test sees no store: a mock returns what its case gives, so a case
  passes on a row Postgres would refuse, and each rule the database enforces needs its own case on
  the repository's e2e. The kernel declares an alias per part's support, and an export where another
  part reads it. The e2e run's `globalSetup` sits in the data's e2e support, though it starts the
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

The leaf doubles, `recordMessageAssistant` for `MessageAssistant`, `recordChatAssistant` for
`ChatAssistant`, `recordMessages` for `QueueSender` and `FileRepositoryTest` for `FileRepository`,
have no contract suite: no set of cases runs on both a double and the leaf's real layer.

- **Why:** a suite run on a double tests test support, which `.claude/rules/effect-tests.md`
  › What to test refuses; each leaf has one real layer.
- **Sources:** Andrew Trenk and Dillon Bly, "Test Doubles", chapter 13 of *Software Engineering
  at Google* (2020), asks for a fake's own tests run against the real implementation; this decision
  departs from it.
- **Rejected:** one suite per leaf, run on the double and on the real layer: a test of test
  support.
- **Cost:** a double can drift from its real layer unseen. One drift stands: `recordMessages`
  keeps the message as given, while `QueueSender.layer` encodes it by its definition's schema,
  so a unit test passes a message the real sender cannot encode.
- **Guarded by:** review alone; nothing compares a double with its real layer.
- **If reversed:** each leaf gains a suite of cases run on both, and the rule line against testing
  test support gets an exception.
- **Revisit when:** a drift of a leaf double hides a defect (a unit test green on what the real
  layer refuses), or an assistant gets a second real layer.

### Decisions recorded in one page

The decisions live here; `CLAUDE.md` points to it, and every Biome message and review rule names
its decision.

- **Why:** a session about to change a boundary reads why it exists first.
- **Sources:** `CLAUDE.md` bans `docs/adr/`.
- **Rejected:** `docs/adr/`: banned. The decisions only in the tickets: a session would have to
  know which ticket made a rule.
- **Cost:** each decision is written twice: in its ticket as history, here as the binding rule.
- **Guarded by:** `make doc-lint` (every backticked repo path exists); review against
  `.claude/rules/claude-md.md`. A ticket id is refused in a code comment by
  `.claude/rules/name-and-body.md` and in an instruction file by `.claude/rules/claude-md.md`, by
  review alone: the user wants no check for it.
- **If reversed:** the decisions go back to the tickets, and the pointer in `CLAUDE.md` goes.
- **Revisit when:** the decisions outgrow one page.

### Instructions name patterns

An instruction file, a `CLAUDE.md`, a rule, a skill or an agent, names a pattern with placeholders
(`<module>/<name>.ts`), a package specifier or the doc that owns a fact, never a source file.

- **Why:** a refactor that keeps every constraint should need no doc edit; on the branch that cut
  the modules, every `CLAUDE.md` edit was a path rename, never a changed constraint. Source files
  are the instances that move, and Claude reads an instruction file in every session it matches,
  so a stale path there misleads the most.
- **Sources:** `.claude/rules/claude-md.md` (the pattern, not the instance); the audit of
  [the ticket that made this decision](../tickets/2026-11-02-1820_lean-instructions/feature.md).
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

### Names judged by one rule

`.claude/rules/name-and-body.md` asks six questions of every public name a change adds, renames
or gives a new body, and heads the naming rules: a line of another rule that asks for a name, a
body or a doc the questions refuse is a defect of that line.

- **Why:** a caller reads the name, the types and the doc, never the body. `naming.md` gives a
  kind of work its verb and `composition.md` a unit its one purpose; each can still ask for a
  name that misleads in a case it did not foresee, and the questions are what tells it.
- **Sources:** Beck, *Smalltalk Best Practice Patterns* (Intention Revealing Selector, Composed
  Method): questions 1 and 4; Martin, *Clean Code*, ch. 2: 1 and 2; Arnaoudova et al.,
  *Linguistic Anti-Patterns* (2013): 3; Yourdon and Constantine, *Structured Design*: the
  cohesion scale of 5; Ousterhout, *A Philosophy of Software Design*, ch. 14 and 15: 6 and the
  comment section.
- **Rejected:** the questions as a peer of the naming rules: two lines that disagree would be
  settled by whichever an agent read last. The sources in the rule: they change no line an agent
  writes, and every `.ts` session pays for them.
- **Cost:** a naming change that meets a refused rule line fixes or reports that line too.
- **Guarded by:** review; the `reviewer`'s Rules pass reports such a line. Nothing in
  `make check`.
- **If reversed:** each naming rule decides its names alone, and a conflict between two of them
  goes to the owner each time.
- **Revisit when:** a question refuses a name the owner keeps.

### Instructions within size limits

A `CLAUDE.md` and a rule each have a line limit; the numbers live only in the limits line of
`.claude/rules/claude-md.md`, which `make doc-lint` reads.

- **Why:** a `CLAUDE.md` or a rule is paid for in every session it matches, and files grow by
  appending: rules sat at or over the limit while the limits were advice that nothing checked.
  A hard limit makes the next fix cut a line instead of adding one.
- **Sources:** `.claude/rules/claude-md.md` (the test a line must pass, the limits); the audit of
  [the ticket that made this decision](../tickets/2026-11-02-1820_lean-instructions/feature.md).
- **Rejected:** the numbers in the doc lint's config, the rule pointing to them: a reader of the
  rule must open the config to learn a limit. Soft limits ("about" a number): nothing refuses them.
- **Cost:** the check depends on one line's shape, so a reworded limits line makes it exit 2,
  naming the line it expects; a file at its limit takes no line without giving one up.
- **Guarded by:** `make doc-lint`, which fails on a file over its limit, naming file and length.
- **If reversed:** drop the `over-limit` rule of the doc lint; the limits go back to advice.
- **Revisit when:** a constraint that passes the test of `claude-md.md` no longer fits its file
  after every other line has been cut.

### Rounds by commit

Every round of a lab's step is a commit of one scope
(`.claude/rules/commits.md › A commit's scope`), named by its step, round and source
(`.claude/skills/lab/SKILL.md › Rounds`), committed by whoever wrote it, the main session or an
`implementer`, as soon as `make check` is green and before the user reads it; the user's own edits,
found between rounds, are a round of their own, and no commit the user has seen is rewritten
before the PR.

- **Why:** the user reviews by commit. A change made over an uncommitted round, by an agent or by
  hand, cannot be told apart from the round afterwards, so the user re-reads the whole step to
  find what moved. A subject that opens with the round's id and source, and a fix's body that
  opens with the round it fixes, show in `git log --oneline` where a change belongs, who asked for
  it and what it corrects. Committing before reading costs nothing on `main`, which takes the
  ticket as one squash.
- **Sources:** `.claude/skills/lab/SKILL.md` (rails 1 and 5, Rounds);
  [the ticket that made this decision](../tickets/2026-11-07-1232_sdd-stages/feature.md).
- **Rejected:** the kind of change in the brackets (`FIX`): it repeats the gitmoji and type and
  leaves the source unnamed. The fixed commit's hash in a fix's body: it goes stale after a
  cherry-pick. A review of the uncommitted step: the user's edits over it mix with the round. The
  user's edits folded into the next agent round: that round's diff is no longer the agent's. One
  commit per run of the implementer, made by the main session: a step's independent parts land
  in one diff, which the reader cannot judge part by part.
- **Cost:** more commits on the branch, a revert of rejected rounds among them; a subject longer
  by the id, which counts apart from its 50 characters; a commit takes 1.3 s for docs and 2.5 s
  for code with the pre-commit hook. Every reader of the step's diff reads a committed range
  (`make review-rules BASE=<base>`, the review's range), and
  `git revert` is allowed by `.claude/settings.json`. The branch's last rounds revert together
  in one commit while nothing after them rests on them; a rejection after later work rests on a
  round fixes forward, since a revert there would pull the base from under that work.
- **Guarded by:** review against `.claude/skills/lab/SKILL.md`; nothing checks a subject's id.
- **If reversed:** one commit in the skill brings back one commit per reviewed step; a written
  history keeps its names.
- **Revisit when:** a ticket's history is read by its PR alone, or the rounds' count makes
  `git log --oneline` of a branch harder to read than its steps.

### One flow, sized at intake

Every change of substance runs through `/lab`: micro on a branch alone, macro with a `lab.md` in
its ticket folder. Both build the same way: the owner's intent and shape first, a failing test,
pieces committed green as rounds, one review per range by fresh `reviewer`s (Intent, Hunt,
Rules; Design on request), a check the owner can repeat. A macro step is built with the owner in
the session, or by an `implementer` once its Shape is settled.

- **Why:** the five-phase cycle stopped being used: none of its skills ran on a feature after the
  owner found that a full hand-off cost days of rework, about half of it thrown away, and every
  feature since ran as a lab or as unit commits from settled decisions. Its plans in stages never
  ran on a real ticket, its ticket prose outweighed the code 2.6 : 1, and its verifications failed
  on prose, reran up to three times, and two tickets merged on a failing run. The published
  methods that size work (BMAD, Tessl, Every) keep one build loop and change only the context
  around it.
- **Sources:** `.claude/skills/lab/SKILL.md`; `docs/knowledge/sdd.md › Why each part`.
- **Rejected:** two cycles routed by a table in a human doc, each with its own rules: the agent
  loaded both, and the table had no row for the one in use. Plans in stages: never run. A
  verification phase with its verifiers: its two recorded catches that every step review had
  passed (an HTTP response changed with no requirement asking, a guard a re-export bypassed) are
  the branch review's Intent and Hunt duties now. Replay R3 holds the first in 2 of 3 runs; the
  second rests on the guard-probe line of `.claude/rules/tooling.md` and the Hunt on a guard's
  range, with no replay (R3's Hunt named the manifest gap in 0 of 3). A Design pass on every new
  interface: 12 of its 22 findings were taken, the rate of Standards, but the owner writes the
  Shape, so it runs on the owner's request. A `simplify` round: 2 of 4 findings taken, its time
  never measured. A researcher per claimed finding: a `claimed` bug is rejected only by its input
  run as a test that stays green.
- **Cost:** no EARS requirements, no `architecture.md` and no `verification.md`: a large feature
  is planned only as far as its Map and the Shape of the step at hand, and no fresh agent checks
  behaviour against a requirement list apart from the branch review. The review per range is one
  round, so a finding its fix introduces waits for the branch review; a micro's one review is its
  branch's, so the owner alone reads its fixes. A code range gets three reviewers, one more than
  the lab's review before: replay R2 cost $3.72 a replay run against $2.21.
- **Guarded by:** review against the skill; the replays of
  `docs/knowledge/sdd.md › Evaluating the toolkit`, run before and after each toolkit change.
- **If reversed:** the `/ticket-*` skills, the `verifier` and the templates come back from the
  commit before this decision; the tickets written under them keep their files.
- **Revisit when:** a macro lab's owner rework or stops exceed those of the SDD tickets before it,
  or a defect merges that a replay shows a verifier would have caught.
