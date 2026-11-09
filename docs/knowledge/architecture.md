# Architecture

How the code is cut and how to extend it: the three rings, what may import what and the guard
that refuses the rest, where tests live, the shape of a use case, and the checklists to add an
entity, a store's client or a module. **Why each boundary holds, what it costs and what breaks if
it is reversed live in [decisions.md](decisions.md),** the living decisions, one record each;
read the record before changing a boundary. Decisions older than those records live in
[architecture.md › Decisions](../tickets/2026-10-16-1433_monorepo-setup/architecture.md#decisions)
of the scaffold ticket and of the architecture audit
(`docs/tickets/2026-10-27-1433_architecture-audit/`). Each layer's binding rules live in its
`CLAUDE.md` and in `.claude/rules/`.

## The three rings

Every dependency points inward, from the boundary to the behaviour to the data:

- **The data**, `kernel/data`, the one source of truth over every store: `Db` over every table and
  relation, the migrations, and a repository per store in the data layer's own types, the
  attachments' objects and the jobs among them. It takes its clients from the context.
- **The behaviour**, `application/`: the modules and above them every use case in
  `application/use-cases`. A module's `domain/` holds its models, pure rules, errors and the ports
  that reach outside; its `services/` the domain services, the mappers
  between an entity and a model and the job definitions, over the data layer's repositories; its
  `infrastructure/` the adapters of its ports; its `contract/`, once another module needs one,
  what other modules may take of it.
- **The boundary**, everything that touches the world outside the process: the kernel's
  configured clients (`/config`, `/postgres`, `/aws`, `/queue`, `/llm`), each module's
  `infrastructure/`, `http-api`, the API contract the api implements and the web client calls,
  which declares the wire itself and imports only `effect`, and the apps, thin entry points that
  assemble the layers and provide the clients. Nothing of `application/` reaches the browser.

`packages/*` holds generic tools, configured by their caller, that know no app. `deployment/`
provisions the stores, locally and on AWS ([aws.md](aws.md)). What each ring and layer may import:
[Dependency rules](#dependency-rules). The records:
[Modules by capability](decisions.md#modules-by-capability),
[A module's layers](decisions.md#a-modules-layers), [One kernel](decisions.md#one-kernel),
[The data at the centre](decisions.md#the-data-at-the-centre),
[The API contract on its own](decisions.md#the-api-contract-on-its-own).

```mermaid
graph TD
  subgraph boundary["boundary"]
    apps["apps/*"]
    httpApi["http-api"]
    infra["a module's infrastructure/"]
    clients["the kernel's clients"]
  end
  subgraph behaviour["behaviour"]
    useCases["application/use-cases"]
    services["a module's services/"]
    domain["a module's domain/ and contract/"]
  end
  subgraph data["data"]
    db["kernel/data"]
  end
  boundary --> behaviour --> data
```

`application/` is one workspace, `@app-template/application`, and one `tsconfig.json` project:
each module and the use cases a folder with one entry, a module's contract a folder in it,
exported through the module's entry. The `apps/e2e` test app runs both app layers in one test
process, starts no process of its own, and nothing imports it.

## Dependency rules

Each row lists what its code may import (✓ allowed, ✗ refused), and the last column the guard
that refuses the row's ✗, each guard described in [Boundary guards](#boundary-guards):

| From ↓ / may import → | another module | a contract | `use-cases` | `kernel/data` | rest of `kernel` | `packages/*` | `http-api` | Refused by |
|---|---|---|---|---|---|---|---|---|
| a module's `domain/` | ✗ | ✓, through its entry | ✗ | the tables' values only | ✗ | ✗ | ✗ | `application/*/domain/**`, `kernel/data` by name |
| a module's `services/` | ✗ | ✓, through its entry | ✗ | ✓, but `Db` and the relations | `/aws`: the inventory only | `db`, `queue` only | ✗ | `application/*/services/**` |
| a module's `infrastructure/` | ✗, its own entry too | ✓, through its entry | ✗ | ✓ | ✓ | ✓ | ✗ | `application/*/infrastructure/**`; its own entry, `use-cases`: `noImportCycles` on a cycle, else review |
| a contract | ✗, nor its module's files | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `application/*/contract/**` |
| `use-cases` | ✓, every layer; `/testing` in its tests only | ✓ | — | ✓ | `/job` only | ✓ | ✗ | `application/use-cases/**`; review, `/testing` |
| `kernel/data` | ✗ | ✗ | ✗ | — | ✗ | ✓ | ✗ | `kernel/data/**` |
| rest of `kernel` | ✗ | ✗ | ✗ | ✓ | ✓, the parts below it | ✓ | ✗ | TS2307, a module, `use-cases`, `http-api`; a part above it: `noImportCycles` on a cycle, else review |
| `packages/*` | ✗ | ✗ | ✗ | ✗ | ✗ | ✓, the ones below it | ✗ | `biome-imports.grit` and TS2307, any workspace; a package above it: `noImportCycles` on a cycle, else review |
| `http-api` | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | — | `http-api/**` |
| `apps/api` | ✓, a mapper in `layer.ts` only | ✓ | ✓ | `layer.ts` only | ✓ | ✓ | ✓ | `biome-imports.grit`, another app and `deployment`; review, the data and the mappers |
| `apps/worker` | ✓, a mapper in `layer.ts` only | ✓ | ✓ | `layer.ts` only | ✓ | ✓ | ✗ | `biome-imports.grit`, another app and `deployment`; TS2307, `http-api`; review, the data and the mappers |
| `apps/web` client | ✗ | ✗ | ✗ | ✗ | ✗ | `ui` only | ✓ | `apps/web/**`; `make bundle-check` |
| `apps/web/main.ts` | ✗ | ✗ | ✗ | ✗ | `/config` only | `ui` only | ✗ | `biome-imports.grit`, another app and `deployment`; TS2307, a module, `use-cases`; review, the rest |
| `deployment` | ✗ | ✗ | ✗ | the files' key only | `/config`, `/aws`: the inventory | ✓ | ✗ | `biome-imports.grit`, any workspace but these and another part; review, the kernel's names |
| `apps/e2e` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | the apps' `exports`, their `./testing` only |

- **Inside a module** the layers point inward too: `domain/` imports neither
  `#<module>/services/*` nor `#<module>/infrastructure/*`, `services/` not
  `#<module>/infrastructure/*`, and `infrastructure/` not `#<module>/services/*`; a service
  reaches the outside world only through a port its `domain/` declares, and a module reaches its
  own files, its contract's too, through `#<module>/…`, never its entry. Of another module's
  entry a module takes only the names of its contract, which review holds
  ([modules.md](../../.claude/rules/modules.md)), not Biome.
- **The apps** never import each other or `deployment`:
  [Independent apps](decisions.md#independent-apps). What a handler may call and import:
  [layering.md › Handlers](../../.claude/rules/layering.md#handlers).
- **`http-api` imports only `effect`:** it is the browser's whole way into the app, so it
  declares every id, constrained string, model shape and error itself
  ([The API contract on its own](decisions.md#the-api-contract-on-its-own)). **A contract
  imports only `effect`** too (and `type-fest` for types), **a module's `domain/` also the values
  its tables declare** (a limit, a pattern, an enum's values, from
  `@app-template/kernel/data`), and none of them nor a module's `services/` import an
  `@effect/*` package ([A module's layers](decisions.md#a-modules-layers)).
- **A dependency on a module's contract counts as one on the module**, so two modules that import
  each other's contracts form a cycle, refused by review where no tool sees it
  ([modules.md](../../.claude/rules/modules.md)).
- **A ✓ is permission, not a declaration.** The dependency must also be in the importer's
  `package.json`, or the isolated linker and `tsc -b` refuse it. Inside the kernel and
  `packages/` the units are ordered: a kernel part imports only the parts below it (`/config` at
  the bottom, `/data` beside it and importing none), a package only the packages below it.
- **Tests** and the support they may import: [tooling.md › Tests](tooling.md#tests).

## Imports: `#<workspace>/` vs `@app-template/`

Every import line says where its module lives:

```ts
import { readFileSync } from 'node:fs'                      // Bun and Node built-ins

import { Effect } from 'effect'                             // external packages

import { buildChat } from '@app-template/application/chat'  // another unit

import { CreateUserMessageUseCase } from '#use-cases/chat/create-user-message.use-case'  // this unit
```

- **`@app-template/<folder>`** reaches another unit through its workspace's `exports`, each
  entry an `index.ts` barrel: the kernel one per part (`@app-template/kernel/data` →
  `kernel/data/index.ts`, every store), a package by its folder (`@app-template/packages/db`),
  a module or the use cases by theirs (`@app-template/application/<module>` →
  `application/<module>/index.ts`, every layer), each with its test support's entries
  ([tooling.md › Tests](tooling.md#tests)).
- **`#<unit>/<path>`** reaches a file of the same unit, through the `imports` map in its
  workspace's `package.json` (`"#chat/*": "./chat/*.ts"`, `"#api/*": "./*.ts"`); a kernel part,
  a package or a module reaches another through that one's entry, never its files. Each layer
  of a module keeps its name in the path (`#chat/services/…`), so a layer's Biome override
  matches the others by glob (`#*/services/**`). Relative `./` and `../` paths are banned, by
  `biome-imports.grit` ([Imports through subpaths](decisions.md#imports-through-subpaths)). A
  bare `#/` prefix would be shorter, but the pinned Bun cannot resolve it.
- **Order** is the four groups above, separated by blank lines. `make fmt` sorts them.

## Where things live

Using the files of `chat` as the map:

| What | File | Named |
|---|---|---|
| branded id | `application/chat/domain/chat.id.ts` | `ChatId`, `MessageId` |
| model with its pure operations | `application/chat/domain/chat.model.ts`, `message.model.ts`; the shared `Status` in `status.model.ts` | `Chat`, `Message` (`Schema.Class`) |
| domain errors | `application/chat/domain/chat.error.ts`, `message.error.ts` | `ChatNotFoundError` (`Schema.TaggedError`) |
| port | `application/chat/domain/assistant.port.ts` | `Assistant` (`Context.Service` with no layer) |
| domain service | `application/chat/services/chat.service.ts` | `ChatService`, over the data layer's `ChatRepository` |
| mapper from an entity to a model | `application/chat/services/chat.mapper.ts` | `ChatFromEntity`, `MessageFromEntity` |
| queue definitions | `application/chat/services/chat.queue.ts` | `assistantMessageQueue` with its job schema |
| adapter implementing a port | `application/chat/infrastructure/assistant.llm.ts` | `AssistantLlmFromConfig` ([ai.md](ai.md)) |
| use case | `application/use-cases/chat/create-user-message.use-case.ts` | `CreateUserMessageUseCase` |
| tables, entities, relations | `kernel/data/chat/chat.table.ts`, `chat.entity.ts`; `kernel/data/relations.ts` | `chats`, `ChatEntity`, `relations` |
| repository | `kernel/data/chat/chat.repository.ts`; `kernel/data/file/file.repository.ts`; `kernel/data/job/job.repository.ts` | `ChatRepository` over `Db`; `FileRepository` over `S3Bucket`; `JobRepository` |
| database client and migrations | `kernel/data/db.client.ts`, `kernel/data/migrations.ts`; `kernel/postgres/` | `Db`; `PgClientFromConfig` and the `make migrate` program ([database.md](database.md)) |
| the jobs over the queue | `kernel/job/job.sender.ts` | `JobSender`: a job's row and its send, last in the caller's transaction |
| database tools any app could use | `packages/db/` | `Transaction`, `createDb`, the shared columns |
| contract group | `http-api/chat/chat.http.ts`; the ids in `http-api/shared/ids.ts` | `ChatHttp` (`HttpApiGroup`); `ApiChat` (`Schema.Struct`); the domain's twins under its names: `ChatTitle`, `ChatStatus`, `ChatNotFoundError` |
| api handler | `apps/api/chat/chat.handler.ts` | `ChatHandler` (`HttpApiBuilder.group`) |
| mapper from a model to its wire shape | `apps/api/chat/chat.mapper.ts` | `buildApiChat`, `buildApiMessage` |
| worker handler: a queue's consumer over a use case | `apps/worker/chat/assistant-message.handler.ts` | `AssistantMessageHandler` |
| the process's layer | `apps/api/layer.ts`, `apps/worker/layer.ts` | `ApiHttp` over the repositories and ports, `ApiLayer` with the clients, `WorkerProcess` but its `Assistant`, `WorkerLayer` with it; `main.ts` runs them |
| browser feature | `apps/web/features/health/health-panel.ts` | `renderHealthPanel` |

Every store folder of `kernel/data`, and every layer of a module, has an `index.ts` barrel, and
each module's own `index.ts` re-exports its layers. The
file suffixes and the naming verbs: [.claude/rules/naming.md](../../.claude/rules/naming.md).

## Where tests live

What goes where, which support a test may import and what runs on what:
[tooling.md › Tests](tooling.md#tests). Why:
[Tests in their folders](decisions.md#tests-in-their-folders).

## A use case

Every use case lives in `application/use-cases/<object>/<verb>-<object>.use-case.ts`, whichever
modules it touches: it composes their services, holds the transaction and enqueues the jobs, and a
rule stays in its module. When a flow becomes one, what it may write past a service and how it
orders its writes: [.claude/rules/layering.md](../../.claude/rules/layering.md). One that spans
modules has the same shape as one that does not:

```ts
// application/use-cases/order/place-order.use-case.ts
export class PlaceOrderUseCase extends Context.Service<PlaceOrderUseCase, {
  /** Places the order of an active customer. */
  readonly place: (
    customerId: CustomerId,
    lines: OrderLines,
  ) => Effect.Effect<Order, CustomerBlockedError>
}>()('@app-template/application/use-cases/order/PlaceOrderUseCase', {
  make: Effect.gen(function* () {
    const customers = yield* CustomerService // the customer module
    const orders = yield* OrderService       // the order module
    const transaction = yield* Transaction
    const place = Effect.fn('PlaceOrderUseCase.place')(function* (
      customerId: CustomerId,
      lines: OrderLines,
    ) {
      yield* customers.requireActive(customerId) // the customer's rule, called
      return yield* orders.place(customerId, lines)
    }, transaction.run)                      // the writes commit together or not at all
    return { place }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make).pipe(
    Layer.provide([CustomerService.layer, OrderService.layer]),
  )
}
```

- **A rule another module owns is called, never copied.** The order module may read the
  customer's row itself, but whether a customer may order is the customer module's rule, so the
  use case calls it. How to tell one rule from two that only look alike:
  [modules.md › Another module's rule copied](../../.claude/rules/modules.md#another-modules-rule-copied).
  Record: [Records open, rules called](decisions.md#records-open-rules-called).
- **No module reacts to another's write.** The flow runs synchronously in one use case; a job
  carries only work that outlives the request (the assistant's reply, the title). Record:
  [Use cases above the modules](decisions.md#use-cases-above-the-modules).

## Add a new entity

An entity is the data layer's record; its model is the module's. Follow the files of `chat` from the
data outward, write each test before its code and run `make check` after each step. `<entity>` is
the kebab name (`document`), `<Name>` the Pascal one of the data layer's names, `<Model>` the
model's.

1. **The data.** `kernel/data/<store>/`, a store's folder (messages share `chat/`):
   `<entity>.table.ts` (the table), `<entity>.entity.ts` (`<Name>Entity` with its `Insert`,
   `Where` and `Set`), `<entity>.repository.ts` (`<Name>Repository` over `Db`), and an
   `index.ts`, re-exported by `kernel/data/index.ts`; the table in
   `kernel/data/relations.ts`; `make migration` writes the migration
   ([database.md](database.md)). What a table and an entity may import and declare:
   [kernel/CLAUDE.md](../../kernel/CLAUDE.md). Ownership is a field of the `<Name>EntityWhere`
   the reads take, so a record of another owner reads as absent, never a check after the read.
   Test the repository on `DbTest`, and add its memory repository with a twin of every guard
   the e2e proves ([tooling.md › Tests](tooling.md#tests)).
2. **The model.** `application/<module>/domain/`: `<entity>.id.ts`, `<entity>.model.ts` (a
   `Schema.Class` with its pure operations; time and ids come in as input; a limit, a pattern or
   an enum's values imported from its table, never declared again,
   [Checks kept in the tables](decisions.md#checks-kept-in-the-tables)), `<entity>.error.ts`,
   each with its unit test.
3. **The mapper.** `application/<module>/services/<entity>.mapper.ts`: `<Model>FromEntity` lays the
   model's schemas over the entity's fields; its unit test encodes the model's extreme values
   through the entity's insert schema and reads them back.
4. **The service.** `application/<module>/services/<entity>.service.ts`: `<Model>Service` over the
   repository, the one owner every handler goes through, tested over the memory repositories.
   The layers' barrels re-export the new files.
5. **The flows.** A flow over two services or a job is a [use case](#a-use-case); asynchronous
   work is a queue definition in the module's `services/` and a handler in `apps/worker/`
   ([database.md › The outbox](database.md#the-outbox)).
6. **The boundary.** A contract group in `http-api/<entity>/<entity>.http.ts`, with the entity's
   wire shape, ids and errors as [http-api/CLAUDE.md](../../http-api/CLAUDE.md) says, added to
   `Api` in `http-api/api.ts` before `.middleware(SchemaErrors)`, which reaches only the groups
   added before it; its handler in `apps/api/<entity>/` and its mappers in
   `apps/api/<entity>/<entity>.mapper.ts`, the handler added to `ApiRoutes` and its services to
   `ApiHttp`, the repository's layer to `ApiLayer`. Test only what HTTP adds, on the api test
   layer; a flow new to both apps joins the journey. A browser feature calls it through
   `ApiClient` from `apps/web/features/<entity>/`.

A new entity in existing workspaces usually needs no new dependency; an undeclared one fails
`make typecheck` with TS2307 ([tooling.md › Add a dependency](tooling.md#add-a-dependency)).

## Add a store's client

The data layer names the client it needs, the kernel builds it from config, the process provides
it. Record: [Clients from the context](decisions.md#clients-from-the-context).

```ts
// kernel/data: the repository asks the context for the client
static readonly layer = Layer.effect(this, S3Bucket.useSync((bucket) => this.of({ … })))
// kernel/aws/aws.client.ts: the boundary builds it from config
export const S3BucketFromConfig: Layer.Layer<S3Bucket, Config.ConfigError>
// apps/api/layer.ts: the process provides it, after the repositories
Layer.provide(Db.layer), Layer.provide([PgClientFromConfig, S3BucketFromConfig])
```

1. **The client** is a generic package (`packages/<store>`) or an Effect library; it takes its
   settings as options and never reads the environment.
2. **The data layer** takes its service from the context in the repository's `layer`, and
   imports nothing of the rest of the kernel ([Dependency rules](#dependency-rules)).
3. **The kernel** reads the settings in a config service of `kernel/config` and builds
   `<Client>FromConfig` in its part (`kernel/<store>/<store>.client.ts`); a resource's name comes
   from the inventory in `kernel/aws/resources`.
4. **Each process** provides it in its `layer.ts`; a missing one is a type error in the layer's
   requirements.
5. **The e2e harness,** in the part's e2e support ([tooling.md › Tests](tooling.md#tests)),
   provides a client of the test's own (a database, a stage) the same way `DbTest` and `AwsTest`
   do; `deployment/local/` provisions the store on the local stand ([aws.md](aws.md)).

## Add a module

A module is a folder `application/<module>/` of the `@app-template/application` workspace,
imported as `@app-template/application/<module>`; its contract, once another module needs it,
the folder `application/<module>/contract/`, exported through the same entry.
Record: [Modules by capability](decisions.md#modules-by-capability).

1. **The entry.** `application/<module>/index.ts` re-exports each layer's barrel; in
   `application/package.json`, an `exports` entry `./<module>` and the alias `#<module>/*`, and
   once it has test support that support's entry and alias
   ([tooling.md › Tests](tooling.md#tests)), as chat's. The folder's one `tsconfig.json` project
   already includes it, and `bun install` links nothing new.
2. **No Biome override.** The overrides and the plugin already match a new module; a layer of a
   new name passes every ban but the plugin's
   ([Guards are configuration](decisions.md#guards-are-configuration)).
3. **A contract** is a folder `contract/` with an `index.ts`, re-exported by the module's entry;
   the `application/*/contract/**` override already covers it. Record:
   [Module contracts](decisions.md#module-contracts).
4. **The consumers** declare `@app-template/application` in their `package.json`; the browser is
   none, and `make bundle-check` refuses the module in its bundle with no edit.
5. **The docs.** The glossary gains the module's words; `decisions.md` a record if the cut is a
   decision ([Decisions recorded in one page](decisions.md#decisions-recorded-in-one-page)).

## Boundary guards

Each import rule of [Dependency rules](#dependency-rules) is held once, by the guard that can see
it, and a last guard checks what an allowed import brings into the web bundle; what no
guard sees, review refuses ([.claude/rules/modules.md](../../.claude/rules/modules.md), and
[layering.md](../../.claude/rules/layering.md) for a handler). Record:
[Guards are configuration](decisions.md#guards-are-configuration).

| Guard | Catches | Reports |
|---|---|---|
| Biome `noRestrictedImports`, one `overrides` entry per layer in `.misc/lint/biome.base.json`, covering the layer's tests | the ✗ of each row whose *Refused by* names its glob, by unit and by imported name, test support aside in the tests; a layer that points outward inside a module; any workspace in an entry of `application/`; the record named in the message | `make lint`, `pre-commit`, CI `static` |
| the GritQL plugin `biome-imports.grit`, which reads the unit (`application/<module>`, `kernel/<part>`, `packages/<package>`) and the ring (`apps/<app>`, `deployment`) from the file's path | another unit's `#<unit>/…`, `#kernel/<unit>/…` or `#testing/<unit>/…` file, in an import, an `export … from`, an `import()` in code or in a type, a `require()`, a `require.resolve()` or `import.meta.resolve()`, or a `vi` loader (`vi.mock`, `vi.importActual`, …), a template literal included; any relative path; the workspaces the rows whose *Refused by* names it refuse, even when the manifest declares them | the same |
| Biome `noImportCycles` | a cycle of value imports: two files, two modules, a kernel part and one that imports it, a module and its own entry | the same |
| the isolated linker with `tsc -b` | an import of a workspace the importer's `package.json` does not declare: the TS2307 cells of [Dependency rules](#dependency-rules) | TS2307 in `make typecheck` and at runtime |
| `composite` project references (`rootDir: "."`), one project per workspace | a path that reaches into an unreferenced workspace's files; a cycle of references between workspaces | TS6059 / TS6307 / TS6202 in `make typecheck` |
| `make bundle-check`: `bun build` of `apps/web/app/main.ts` with a metafile, read by `.misc/lint/bundle-check.mjs` | a package in the browser bundle outside `browserPackages` in `apps/web/package.json`: a workspace's entry, a third-party library, a Node built-in | the package and the shortest import chain from the entry, in `make check` |

Why each rule sits with its guard, and what that costs:
[Guards are configuration](decisions.md#guards-are-configuration). Symptoms and fixes:
[tooling.md › Troubleshooting](tooling.md#troubleshooting).

The bundle guard reads the build's metafile, which lists every input the bundle keeps with its
imports, so it sees what the bundle holds however Bun applies `"sideEffects"`, and names no
folder of the repository: an input under `node_modules` belongs to the package its last
`node_modules/<name>` names, any other to its nearest `package.json`, plus the subpath of the
export whose folder holds it (`@app-template/packages/ui`). The entry's own workspace is implied.
A type-only import is erased and passes, as it should. `apps/web` imports only `http-api` and
`packages/ui`, and the contract imports only `effect`, so a leak comes through a package the list
allows growing a server import, which the guard refuses with its chain. A metafile without
`inputs`, `outputs` or one entry point, or a manifest it cannot find, stops it with exit 2, never
a clean pass.

### Known gaps

The import forms below break an import rule and pass every import guard, so only review refuses
them:

- **A type import inside an expression in web client code.** `export type X =
  import('@app-template/kernel/config').ApiConfig['Service']` in `app/`, `features/` or
  `shared/` passes Biome's `noRestrictedImports`, which does not see `import()` inside a type,
  and `tsc -b`, because web declares `@app-template/kernel` for its server entry. The type is
  erased, so nothing reaches the browser, but the client then depends on the shape of the server
  config.
- **A namespace import of an entry.** `import * as Data from '@app-template/kernel/data'` where
  only its stores are allowed passes every ban by name (`importNamePattern` sees no name);
  `Data.<Name>` then reaches what the names were refused for.
- **A data layer's export named like a value, in a module's `domain/`.** Of
  `@app-template/kernel/data` the domain guard admits only the names of a value's shape
  (`<name>Pattern`, `<name>Length`, `<name>Size`, a plural such as `<name>Statuses`) and refuses
  the rest, a namespace import included; a table or an enum given such a name passes it, so
  review keeps those names to values.
- **A runtime module or third-party package in a module's `domain/`.** `node:crypto` or any npm
  package passes the domain guard, which bans only workspaces and `@effect/*`. Purity rests on
  review alone: no check looks for `Date.now`, `new Date(` or `randomUUID`.
- **A test's needs in a layer's source, a test file outside a layer.** A layer's override covers
  its tests, so `@effect/vitest`, a `/testing` entry and, in a module's services,
  `@effect/platform-bun` pass in the layer's source too. A module's test support
  (`application/<module>/__tests__/testing/`) serves several layers and keeps no list, and the
  data layer's tests and e2e sit outside its override, so `@app-template/kernel/llm` passes
  there; `tsc -b` too, as the folder's manifest declares the kernel.
- **A specifier the plugin cannot read.** `biome-imports.grit` reads a literal in the forms
  [Boundary guards](#boundary-guards) lists; one built at runtime (`import(name)`, a string
  joined from parts) or handed to another loader passes it. In `packages/` it then reaches any
  workspace the one manifest declares, elsewhere another unit's file.
