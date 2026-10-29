# Architecture

Where code belongs, what it may import, and how to add a new entity. Each layer's binding rules
live in its `CLAUDE.md`; the decisions behind them, with the rejected alternatives, live in the
scaffold ticket's `architecture.md › Decisions` (`docs/tickets/2026-10-16-1433_monorepo-setup/`).

## Layers

```mermaid
graph TD
  apps["apps/api · apps/worker"] --> application
  application --> infrastructure
  infrastructure --> domain
  application --> domain
  apps -->|"apps/api only"| httpApi["http-api"]
  httpApi --> domain
  apps --> packages["packages/* (aws · config · queue · llm · s3 · testing · ui)"]
  application --> packages
  infrastructure --> packages
  web["apps/web client"] --> httpApi
  web --> ui["packages/ui"]
  webMain["apps/web/main.ts"] --> ui
  webMain --> config["packages/config"]
  deployment --> packages
```

Imports only go **down**: `apps` → `application` → `infrastructure` → `domain`, and `apps/api`
and `apps/web` → `http-api` → `domain`. A layer may skip levels: `application` usually imports
`domain` directly.

| Workspace | Holds | Rules |
|---|---|---|
| `domain/` | entity models, errors, ports and pure operations; no I/O, no clock | [domain/CLAUDE.md](../../domain/CLAUDE.md) |
| `http-api/` | the HTTP contract (`HttpApi`) over the domain, shared by `apps/api` and the browser | [http-api/CLAUDE.md](../../http-api/CLAUDE.md) |
| `infrastructure/` | adapters that implement domain ports on top of `packages/*` clients | [infrastructure/CLAUDE.md](../../infrastructure/CLAUDE.md) |
| `application/` | services over ports, and use cases that compose services | [application/CLAUDE.md](../../application/CLAUDE.md) |
| `packages/*` | generic, project-agnostic clients and libraries, with the one exception its rules name | [packages/CLAUDE.md](../../packages/CLAUDE.md) |
| `apps/*` | entry points (`main.ts`) | [apps/CLAUDE.md](../../apps/CLAUDE.md) |
| `deployment/` | `local/`, the Pulumi program of the local stand: MiniStack and the resources inside it ([aws.md](aws.md)); `aws/`, the resource code as functions of a provider, the rest a stub for now | [deployment/CLAUDE.md](../../deployment/CLAUDE.md) |

### Dependency rules

Each row lists what a workspace may import.

| From ↓ / may import → | domain | http-api | infrastructure | application | packages/* | apps |
|---|---|---|---|---|---|---|
| domain | — | ✗ | ✗ | ✗ | ✗ | ✗ |
| http-api | ✓ | — | ✗ | ✗ | ✗ | ✗ |
| infrastructure | ✓ | ✗ | — | ✗ | ✓ | ✗ |
| application | ✓ | ✗ | ✓ | — | ✓ | ✗ |
| packages/* | ✗ | ✗ | ✗ | ✗ | ✓ (each other) | ✗ |
| apps/api | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ (no sibling app) |
| apps/worker | ✓ | ✗ | ✓ | ✓ | ✓ | ✗ (no sibling app) |
| apps/web client (`app/`, `features/`, `shared/`) | ✗ | ✓ | ✗ | ✗ | `ui` only | ✗ |
| apps/web/main.ts | ✗ | ✗ | ✗ | ✗ | `ui`, `config` | ✗ |
| deployment | ✗ | ✗ | ✗ | ✗ | ✓ | ✗ |
| e2e | ✓ | ✓ | ✓ | ✗ | `config`, `testing` | ✓ (`api/layer`, `worker/layer`) |

- **`domain` imports `effect` and no workspace,** not even `packages/*`, and no `@effect/*`
  package but the test runner `@effect/vitest`, so it stays pure and testable without fakes;
  `type-fest` it imports for types only (`RequireAtLeastOne`). Its tests alone may also import
  the test support `@app-template/testing`.
- **`http-api` imports `effect` and `domain` only.** It is the system's HTTP boundary, shared by
  the api that implements it and the browser that calls it, so it lists the domain's ids, models
  and errors instead of copies, and the wire carries the domain's tags (`UserUnknownError`). The
  domain therefore ships to the browser: it declares `"sideEffects": false`, so a bundle keeps
  only the schemas it uses and drops the ports.
- **`apps/web` client code ships to the browser.** It calls the api through `ApiClient` from
  `http-api` and runs its Effects itself; only its server entry `main.ts` may read `config`, to
  get a validated `WEB_PORT`.
- **A ✓ is permission, not a declaration.** The dependency must also be in the importer's
  `package.json`; see [the boundary guards](#boundary-guards).

## Imports: `#<workspace>/` vs `@app-template/`

Every import line says where its module lives:

```ts
import { readFileSync } from 'node:fs'                      // Bun and Node built-ins

import { z } from 'zod'                                     // external packages

import { buildChat } from '@app-template/domain/chat'        // another workspace

import { SendMessageUseCase } from '#application/chat/send-message.use-case'  // this workspace
```

- **`@app-template/<workspace>[/<entity>]`** reaches another workspace through its `exports`. A
  layer exposes each entity as a subpath (`@app-template/domain/chat` →
  `domain/chat/index.ts`).
- **`#<workspace>/<path>`** reaches a file inside the same workspace, through the `imports` map in
  its `package.json` (`"#domain/*": "./*.ts"`, `"#api/*": "./*.ts"`). Relative `./` and `../`
  paths are banned. A bare `#/` prefix would be shorter, but Bun 1.4.3 cannot resolve it.
- **Order** is the four groups above, separated by blank lines. `make fmt` sorts them.

## Where things live

Using the `chat` slice as the map:

| What | File | Named |
|---|---|---|
| branded id | `domain/chat/chat.id.ts` | `ChatId`, `MessageId` |
| entity schema | `domain/chat/chat.model.ts`, `message.model.ts` | `Chat`, `Message` (`Schema.Class`) |
| read model a port answers | `domain/chat/chat.model.ts`, `message.model.ts` | `ChatSummary`, `ChatDetail`, `MessageDetail` |
| domain errors | `domain/chat/chat.error.ts`, `message.error.ts` | `ChatNotFoundError` (`Schema.TaggedError`) |
| port and pure operations | `domain/chat/chat.port.ts`, `chat.model.ts`, `message.model.ts` | `ChatRepository`, `buildChat({ id, userId, createdAt })`, `prepareMessage` |
| database client and migrations | `infrastructure/db/` | `Db`, `Db.layerFromConfig`, `migrations/`, the shared columns in `columns.ts`, the relations in `relations.ts` |
| tables and row codecs | `infrastructure/chat/chat.entity.ts` | `chats` (`snakeCase.table`), `ChatRow`, `ChatInsert` |
| adapter implementing the port | `infrastructure/chat/chat.repository.ts` | `ChatRepositoryPg` (a `Layer` over `Db`) |
| queue definitions | `infrastructure/chat/chat.queue.ts` | `assistantMessageQueue`, `GenerateAssistantMessage` (the job schema) |
| relay from the database to a queue | `infrastructure/outbox/outbox.relay.ts` | `OutboxRelay` (a worker `Layer` that runs a fiber and provides nothing) |
| adapter of the assistant port, with the prompts | `infrastructure/chat/assistant.llm.ts` | `AssistantLlm` (a `Layer` of `Assistant` over `LanguageModel`) |
| domain service over the ports | `domain/chat/chat.service.ts`, `message.service.ts` | `ChatService`, `ChatService.layer`, `MessageService` |
| use case composing services | `application/chat/send-message.use-case.ts`, `generate-assistant-message.use-case.ts` | `SendMessageUseCase`, `SendMessageUseCase.layer`, `GenerateAssistantMessageUseCase` |
| worker handler: a queue's consumer over a use case | `apps/worker/chat/assistant-message.handler.ts` | `handle`, `handleDeadLettered`, `AssistantMessageHandler` (a worker `Layer`) |
| test support | `application/testing/chat.test-layer.ts` | `ChatTest`, `layerChatTest(chats)` |
| contract group | `http-api/chat/chat.http.ts` | `ChatHttp` (`HttpApiGroup`), the DTOs `Chat`, `Message` |
| handler | `apps/api/chat/chat.handler.ts` | `ChatHandler` (`HttpApiBuilder.group`) |
| browser feature | `apps/web/features/health/health-panel.ts` | `renderHealthPanel(root)` |

Every entity folder has an `index.ts` barrel. Tests sit at the workspace's top and mirror the
source path: `tests/**/*.test.ts` need no Docker, `e2e/**/*.e2e.ts` do.
The file suffixes and naming verbs are listed in
[.claude/rules/naming.md](../../.claude/rules/naming.md). How the tables, codecs and migrations
work: [database.md](database.md).

## Add a new entity

Follow the `chat` slice layer by layer, from the bottom up. Write each test before its code,
and run `make check` after each layer. `<entity>` is the kebab name (`document`), `<Entity>` the
Pascal one (`Document`).

1. **Domain model.** `domain/<entity>/<entity>.id.ts`: `<Entity>Id` as a branded `Schema` with a
   same-named type; `<entity>.model.ts`: `<Entity>` as a `Schema.Class`.
2. **Domain errors.** `<entity>.error.ts`: `Schema.TaggedError` classes named
   `<Entity><Problem>Error`, whose tag is the class name.
3. **Port and operations.** `<entity>.port.ts`: the `<Entity>Repository` port as a
   `Context.Service` with no layer; `<entity>.model.ts`: pure operations such as
   `build<Entity>(input)`. Time and ids come in as input, never from `Date.now()` or
   `crypto.randomUUID()`. Test them in `domain/tests/<entity>/<entity>.model.test.ts`. Ownership
   is a field of the `<Entity>OneWhere` the port's `selectOne(where)` takes, so an owner mismatch
   reads as absent, never a predicate after the read.
4. **Domain exports.** `domain/<entity>/index.ts` re-exports its files, and
   `domain/package.json` gains `"./<entity>": "./<entity>/index.ts"` in `exports`.
5. **Tables and adapter.** `infrastructure/<entity>/<entity>.entity.ts` declares the tables and
   their row codecs, `infrastructure/db/relations.ts` gains them, and `make migration` writes the
   migration ([database.md](database.md)). `<entity>.repository.ts`: `<Entity>RepositoryPg`, a
   `Layer` constant that provides the domain port over `Db`. Add `index.ts`, which also exports
   `<Entity>Pg`, the one layer of every adapter of the aggregate
   (`ChatPg = Layer.mergeAll(ChatRepositoryPg, MessageRepositoryPg)`), and the `exports` entry.
6. **Service and use cases.** `application/<entity>/<entity>.service.ts` holds the service and
   `<verb>-<object>.use-case.ts` each use case, both a `Context.Service` with a `layer`, like
   `application/chat/`. Which flow goes where:
   [.claude/rules/layering.md](../../.claude/rules/layering.md). Test them in
   `application/tests/` over the memory layers through the test layer, with `TransactionTest`
   and `recordQueue()`. Shared test support goes in `application/testing/`. Add
   `index.ts` and the `exports` entry.
7. **Job, if the entity has asynchronous work.** `infrastructure/<entity>/<entity>.queue.ts`
   holds the queue definitions (name, job schema, retry policy, `jobId`), and any prompt the model
   needs goes in `<entity>.llm.ts`. The use case that starts the work sends the job with
   `QueueClient.send` from `packages/queue`; `apps/worker/<entity>/<object>.handler.ts` holds
   `handle` and `handleDeadLettered` over a use case and their `worker` layer, which
   `apps/worker/layer.ts` merges and provides with the `<Entity>Pg` layers the handlers read.
8. **Contract.** Add the group in `http-api/<entity>/<entity>.http.ts`, listing the domain's errors
   with their statuses (`HttpApiSchema.status`), and add it to `Api` in `http-api/api.ts` before
   `.middleware(SchemaErrors)`.
9. **Delivery.** Implement the group in `apps/api/<entity>/<entity>.handler.ts` with
   `HttpApiBuilder.group(Api, '<group>', …)`: it calls the use cases and services and projects
   each model onto its DTO through `apps/api/shared/projections.ts` (`Struct.pick`). Add it
   to `ApiRoutes` and its services to `ApiHttp` in `apps/api/layer.ts`; its `<Entity>Pg` and any
   AWS adapter go to `ApiLayer`, so `ApiHttp` runs over the ports alone and the api test layer
   provides the memory layers in their place (`@app-template/domain/testing`, with the recording
   queue's client from `@app-template/application/testing`).
   Test in `apps/api/tests/<entity>/<entity>.handler.test.ts`, on
   `apps/api/testing/api.test-layer.ts`, only what HTTP adds (statuses, cookies, the wire shape);
   the rules stay in the domain and application suites.
10. **Client, if the browser needs it.** `ApiClient` from `@app-template/http-api` already has
    every endpoint of the contract; add a feature folder under `apps/web/features/<entity>/`
    whose Effect calls it through `ApiClient.use`.

A new entity in existing workspaces usually needs no new dependency, because the layers already
declare each other. Check the importer's `package.json` anyway: `apps/worker`, for one, does not
declare `@app-template/domain`. A new external client is a new dependency; see
[tooling.md](tooling.md#add-a-dependency).

## Boundary guards

The import rules are enforced three times, each catching what the others miss, and a fourth guard
checks what the import rules leave to tree shaking, the web bundle:

| Guard | Catches | Reports |
|---|---|---|
| Biome `noRestrictedImports`, one `overrides` entry per layer in `biome.json` | an import that goes up a layer or into a sibling app; any relative path; a workspace or an `@effect/*` package other than `@effect/vitest` in `domain` (in its `tests/` and `testing/`, a workspace other than `@app-template/testing`); a workspace other than `domain`, or an `@effect/*` package, in `http-api`; `http-api` in a lower layer, a package, the worker or `deployment` | `make lint`, `pre-commit`, CI `static` |
| the isolated linker with `tsc -b` | an allowed import of a workspace that is not declared in `package.json` | TS2307 in `make typecheck` and at runtime |
| `composite` project references (`rootDir: "."`) | a path that reaches into an unreferenced workspace's files | TS6059 / TS6307 in `make typecheck` |
| `make bundle-check`: `bun build` of `apps/web/app/main.ts`, then a `grep` of the bundle | a domain service or port in the browser bundle, or an adapter, which carries its port's key: a value import of one that `http-api` passes on | the matched service keys, in `make check` |

The Biome overrides are **deny-lists**: each names the workspaces a layer must not import. A new
`packages/*` workspace therefore needs no change to them, while a new layer or app does. Test
files follow their workspace's override, save `domain/tests/**` and `domain/testing/**`: an
override each, after domain's, lets both import `@app-template/testing`, and the tests alone
`@effect/platform-bun`. Overrides that match the same file replace each other's options rather
than merge, so every override repeats the relative-path ban, and the two domain test overrides
repeat every domain ban. Symptoms
and fixes:
[tooling.md › Troubleshooting](tooling.md#troubleshooting).

The bundle guard greps the service keys (`"@app-template/domain/chat/ChatRepository"`): string
literals, which survive the build however Bun applies `domain`'s `"sideEffects": false`. A
type-only import is erased and passes, as it should. `apps/web` cannot import `domain` at all, so
a leak comes through `http-api`, which imports the domain barrels for their schemas and errors;
tree shaking drops the services and ports beside them, and the guard proves it on every check.

### Known gaps

Three forms pass every guard. No code uses them; review is what catches them.

- **A type import inside an expression in web client code.** `export type X =
  import('@app-template/config').ApiConfig['Service']` in `app/`, `features/` or `shared/` passes
  Biome, which does not see `import()` inside a type, and `tsc -b`, because web declares
  `@app-template/config` for its server entry. The type is erased, so nothing reaches the browser,
  but the client then depends on the shape of the server config.
- **A workspace importing itself by name.** `@app-template/application/chat` from inside
  `application/` passes Biome, whose overrides list only other workspaces, and `tsc -b`, which
  resolves a package's own `exports`. It skips the `#<workspace>/` convention and can import the
  file's own barrel, a cycle that shows up as `undefined` while modules initialise.
- **A runtime module or third-party package in `domain`.** `node:crypto` or any npm package passes
  the domain guard, which bans only workspaces and `@effect/*`. Purity rests on review and on the
  grep for `Date.now`, `new Date(` and `randomUUID`.
