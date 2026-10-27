# Architecture audit

> Ticket: `2026-10-27-1433_architecture-audit` · Source: the user's review notes, grilling on
> 2026-10-27 · Related: [architecture.md](./architecture.md) · [plan.md](./plan.md)

## Goal

The layering is audited horizontally (what each layer holds) and vertically (how one flow crosses
the layers) and reset to one model: `domain` holds the models, the ports and the domain services
that own the rules; `application` holds only use cases, which compose domain services with the
bucket, the queue, the assistant and a transaction; the apps hold thin handlers, in the worker as
in the api. The audit removes what does not earn its place (one-line helpers, a `.job` file that
is producer and worker at once, hand-rolled byte chunking before S3, an `unknown` in the
repositories' write mapping) and gives the tests one layout: unit tests over memory ports beside
each module, e2e tests over the real infrastructure, two commands. The technical vocabulary joins
the glossary, so the rules point at one definition of each word.

## Context

- **Starting point.** `postgres-drizzle` (4) has every plan step done on `feat/postgres-drizzle`;
  its `/ticket-verify` and PR are pending. This ticket's branch `refactor/architecture-audit` is
  cut from that branch, and its PR waits for that merge. The reads already run as Drizzle
  relational queries (`db.query.*` with `with`); `Message` carries no `attachmentIds`; no manual
  join is left in application code.
- **Where the rules sit today (2026-10-27).** The pure rules live in `domain/*/*.service.ts` next
  to the ports (builders, transitions, `isActiveMessage`, `ensureBindable`, `isVisibleTo`). The
  `application` services are port compositions plus `DateTime.now` and `Crypto`; three rules hide
  among them: the rename transition in `ChatService.rename`, `opensChat` in `findSendable`, and
  "the first missing id in the order asked" in `AttachmentService.bind`. The reply job writes the
  message's intermediate stages through `MessageRepository` directly, so the message has two
  writers; the settle goes through `ChatService.settleReply`. `chat.llm.ts` holds two rules: the
  title cut to `maxTitleLength` by graphemes, and "blank text never reaches the model". The
  worker's two jobs are each one file with the producer (`enqueue`), the handler and the worker
  layer; `packages/queue` exports `QueueClient`, `worker`, `encodeBody`, `QueueTransport`.
- **Helpers (2026-10-27).** `isTitledChat` has no caller; `isInChat` one; `ensureFound` five, each
  one line when inlined; `isOwnedBy` three, in chat and attachment.
- **Drizzle 1.0.0-rc.5 (2026-10-27).** The object filter (`{ stage: 'queued' }`, nested
  `{ messages: {…} }`, `through` for many-to-many) exists only on `findFirst`/`findMany`;
  `update`/`delete` take `SQL | undefined`, and `set` takes column values or `undefined`, never an
  `Option`. The `effect-postgres` driver exposes the same `db.query` API as an `Effect`.
- **S3 (2026-10-27).** `AttachmentStoreS3` runs on `@effect-aws/client-s3` 2.0.0 (peer
  `effect >=4.0.0-beta.66 <5`). Multipart request parsing and its limits are Effect's
  (`HttpApiSchema.asMultipartStream`); the hand-written part is the 5 MiB chunking and the
  create/uploadPart/complete/abort choreography, about 60 of 226 lines. Effect 4.0.5 has
  `Sink.fold(initial, continue, step)` with leftovers, `Stream.transduce`, `Stream.zipWithNext`
  and `ByteSize.mebibytes`; `Bytes.concat` arrives in effect 4.0.6, which `@effect/platform-bun`,
  `@effect/sql-pg` and `@effect/vitest` also publish. `Bun.S3Client` has no object tagging, on
  which the unbound lifetime rests; `@aws-sdk/lib-storage` is not installed.
- **Tests (2026-10-27).** All application, api and 11 of 12 infrastructure suites run on a
  Testcontainers Postgres (`DbTest`), with memory fakes for S3 and the model; the queue suite
  runs on MiniStack SQS. `#<workspace>/*` resolves from any folder depth in the layers (an
  experiment confirmed it for Bun and `tsc`); `apps/*` map `#api/*` to `./src/*.ts` and include
  `src/**/*.ts` only; all three apps have a `src/`, no layer or package does. `vitest.config.ts`
  has no `include` and no `projects`; vitest 5 has `projects`. Biome's layer overrides match any
  subfolder. A hidden folder (`.tests/`) was tried and rejected: vitest and Biome see it, but
  `tsc`'s `**/*.ts` skips dot folders and `rg` skips hidden ones, both silently.
- **Postgres 18.6 (2026-10-27).** `messages.error` is already `jsonb`; the outbox `body` is
  `text` with no index on it; Drizzle supports `jsonb().$type<T>()` and `index().using('gin', …)`.
- **Sources read (2026-10-27).** Software Architecture Guild (domain model building blocks,
  layered and modular monolith, components, coupling), Clean Coder (The Clean Architecture,
  Screaming Architecture, A Little Architecture), dofactory's GoF catalogue, the OTUS DDD guide
  on Habr. What they settle: a domain service is "stateless, behavior-only, named in the
  ubiquitous language" and "focused on domain logic, not infrastructure plumbing"; the application
  layer "coordinates use cases, sets transaction scope"; "each business rule defines an interface
  for just the data access facility that it needs" and "senders own the interfaces"; "if two parts
  always change together, they probably belong in one component"; "hops that only shuttle DTOs
  … should be removed or collapsed"; an aggregate is the transaction boundary. None defines a
  "job"; none puts a service tier between the interactor and the entities. The guild's "service"
  is a deployable unit, not a class.
- **Decided in grilling (2026-10-27).** The ticket is its own, not a step of `postgres-drizzle`.
  Services move to `domain` and take time and ids from `DateTime.now` and `Crypto`; `application`
  keeps use cases only; a handler calls a domain service directly when the flow is one method.
  Ports for the bucket and the assistant are the domain's; the queue is not a port, since no rule
  speaks of queues. The `.job` files go: worker handlers in `apps/worker`, the reply and the title
  as use cases. One `chat` component with files per entity; a `message/` folder would cycle on
  `ChatSummary`, the ids and `relations.ts`. The generic `<Entity>Set`/`<Entity>Where` ports stay,
  typed through shared types, over intention-named methods, because the generic write is the deep
  abstraction the next entity reuses. `S3Bucket` is written on the libraries already present, no
  `lib-storage`, no `Bun.S3Client`. Unit tests mock the ports with memory layers and never start
  Docker; e2e tests inject the whole infrastructure; `make check` keeps running both. Both kinds
  sit in one folder each at the top of the workspace, not beside the module, so a module folder
  holds source only; the support stays in `testing/`, since fixtures serve both kinds and the
  apps import `application/testing`. Shared
  files are a later ticket, where a file lives as long as its owner needs it.
- **Decided on the open questions (2026-10-27).** `isOwnedBy` goes: Effect has no `propEq`, and
  the nearest form (`Predicate.Struct({ userId: … })`) still spells the lambda, while a `userId`
  field in the `Where` of `selectOne` needs no predicate at all. Domain tests may import
  `@effect/platform-bun` for `BunCrypto.layer` (a Biome override on `domain/tests/**`);
  `TestCrypto.layer(seed)` in `effect/testing` seeds the random bytes over a real `Crypto` and
  serves only a test that asserts an id. The `Sink.fold` boundary is not a question: the
  three cases (0 bytes, exactly 5 MiB, 5 MiB plus one byte) are e2e tests of `S3Bucket`. E2E tests
  run on their own Testcontainers, never on the local stand: a Postgres and a MiniStack per
  vitest run, so a worktree's run owns its containers and no test reads `.env`; a database per
  test copied from a migrated template, as today, and per-test names on MiniStack; S3 and SQS
  are real in e2e, the memory layers serve unit tests only; one `vitest.config.ts` with two
  `projects`, chosen by `--project`, where the `e2e` project's one `globalSetup` starts both
  containers once per run and hands their addresses to the tests through `inject`, since a
  container per file would pay a MiniStack and a Postgres start for each of some 25 files. The
  web app imports `ApiClient` from `http-api`, which
  lists the domain's ids, models and errors, so the domain does ship to the browser today:
  `"sideEffects": false` stays, one barrel per entity, and a check on the web bundle guards that
  no service, port or adapter reaches it; a client package consumable without the server code is
  `client-publishing` (10).

## Scope

- Ports in `domain` for repositories, the bucket and the assistant; domain services over them.
- Use cases as the only `application` members; worker handlers in `apps/worker`.
- The `chat` component split into `chat.*` and `message.*` files in every layer.
- The one-line helpers removed; the nested bodies straightened.
- The repositories' write mapping typed once, in `infrastructure/db`.
- `packages/s3` with `S3Bucket`; `effect` and `@effect/*` at 4.0.6; the outbox body as `jsonb`.
- One `tests/` and one `e2e/` at the top of each workspace, mirroring the source
  paths; memory layers in `domain/testing`; vitest `projects`; `make test-unit` and
  `make test-e2e`.
- E2E tests on a Postgres and a MiniStack of their own per run: S3 and SQS real, so
  `AttachmentBucketS3` and the relay get their first real tests; a root `e2e/` workspace with
  one journey through both apps.
- No `src/` in the three apps, so every workspace has the same shape.
- The architecture language in the glossary; the rules, the layer `CLAUDE.md` files and the
  knowledge docs rewritten to the new model.

## Out of scope

- Shared files (a pool a user uploads to, then links to a message or a chat): the roadmap entry
  `shared-files`, after this ticket.
- `isOwnedBy`: kept as the one shape contract `{ userId }` until the user reviews it (open
  question).
- Browser e2e tests: `web-app` (7).
- A client package the browser or another project consumes without the server code:
  `client-publishing` (10); here only the bundle guard (R23).
- Any new `jsonb` column or index on messages or attachments: no query reads a nested field.
- The HTTP contract (`http-api`) and the web client: unchanged.
- The behaviour of any flow: the send, the reply, the title, the bind, the delete and the
  attachment lifetime do what they do today; the e2e suites prove it.

## Requirements

### Layers

- **R1** — WHEN a domain rule needs something outside the process (records, bytes, the
  assistant), THE SYSTEM SHALL declare it as a port in `domain/<entity>/<entity>.port.ts`, in the
  domain's words, with no layer; its adapter lives in `infrastructure`.
- **R2** — WHILE an aggregate has rules, THE SYSTEM SHALL hold them in one domain service in
  `domain` (`ChatService`, `MessageService`, `AttachmentService`, `UserService`), a
  `Context.Service` over its ports, `DateTime.now` and `Crypto`; every write with a
  precondition, a transition, a second field or a domain error beyond not-found goes through
  it, and a use case writes through a repository only a rule-free field (one `set`, one
  `where`, the row gone as the only refusal); `application` holds no service.
- **R3** — WHEN a flow composes the bucket, the queue, the assistant, more than one domain service
  or one transaction, THE SYSTEM SHALL hold it in a use case in
  `application/<entity>/<verb>-<object>.use-case.ts`; the handler calls the use case.
- **R4** — WHILE a flow is one domain service method, THE SYSTEM SHALL have the handler call the
  domain service directly, with no use case between them.
- **R5** — WHEN a use case or a handler changes an assistant message's stage (preparing,
  generating, a text snapshot, completed, failed), THE SYSTEM SHALL write it through the
  message's domain service, never through `MessageRepository`.
- **R6** — WHEN the worker consumes a queue, THE SYSTEM SHALL run a handler in
  `apps/worker/<entity>/<object>.handler.ts` that decodes the job, calls one use case and maps
  the outcome to an acknowledgement or the dead-letter path; no `.job` file remains.
- **R7** — WHEN a use case enqueues a job, THE SYSTEM SHALL call `QueueClient.send` with the
  definition from `infrastructure/<entity>/<entity>.queue.ts` inside the transaction of the
  records the job reads, as the send does today through the outbox.
- **R8** — WHEN a chat title is derived from text, THE SYSTEM SHALL cut it to its length by
  graphemes and refuse blank text in a pure domain operation (`buildChatTitle`); the prompt text
  lives only in the assistant's adapter (`AssistantLlm`), and `chat.llm.ts` is gone.
- **R9** — WHILE records move from the database to a queue, THE SYSTEM SHALL do it in an
  infrastructure relay layer (`OutboxRelay`) that holds no business rule.

### Components and code

- **R10** — WHILE the `chat` component holds chats and messages, THE SYSTEM SHALL keep one
  `chat/` folder per layer with files per entity (`chat.model.ts`, `message.model.ts`,
  `chat.error.ts`, `message.error.ts`, `chat.port.ts`, `message.port.ts`, `assistant.port.ts`,
  `chat.service.ts`, `message.service.ts`), and no `message/` folder.
- **R11** — WHEN the audit lands, THE SYSTEM SHALL have no `ensureFound`, `isInChat` or
  `isTitledChat` or `isOwnedBy`: ownership is a field of the `<Entity>Where` a repository's
  `selectOne(where)` takes (`chats.selectOne({ id, userId })`), so the database answers "not
  yours" and "not found" alike, as today. Where a field check on a value in hand remains, it is
  `Predicate.Struct({ userId: (id) => id === userId })` inline, wrapped only if several places
  repeat it.
- **R12** — WHERE this ticket touches an Effect body, THE SYSTEM SHALL have no `Effect.gen` inside
  another, no callback inside a callback deeper than one level, and no ternary inside a
  combinator; the five nested spots found (`streamSnapshots`, the relay's loop, the upload's
  pipe, the reply's attachment read, the multipart `acquireRelease`) read top to bottom.
- **R13** — WHILE a repository maps an `<Entity>Set` or `<Entity>Where` onto its table, THE
  SYSTEM SHALL use one shared pair of types from `infrastructure/db` (a set column typed by the
  table's column, a where column answering `SQL | undefined`) and one shared builder; no
  `unknown` and no `Struct.evolve(Struct.pick(…))` in a repository.
- **R14** — WHEN the ticket lands, THE SYSTEM SHALL pin `effect`, `@effect/platform-bun`,
  `@effect/sql-pg` and `@effect/vitest` at 4.0.6.

### Storage

- **R15** — WHEN bytes are put to S3, THE SYSTEM SHALL do it through `S3Bucket` in `packages/s3`:
  `put(key, content, { contentType, fileName, tags })` uploads one `PutObject` while the content
  fits one part and a multipart upload otherwise, cutting parts of at least 5 MiB with
  `Stream.transduce(Sink.fold(…))`, `Stream.zipWithNext` and `Bytes.concat`, and aborts the
  upload on failure; `get`, `url`, `delete`, `untag` and `exists` complete it, the bucket being
  an option of its layer. `AttachmentBucketS3` holds only the keys and the mapping to the
  domain's types.
- **R16** — WHEN a job is written to the outbox, THE SYSTEM SHALL store its body as `jsonb`, with
  no index on it.

### Tests

- **R17** — WHILE a workspace has unit tests, THE SYSTEM SHALL keep them in one `tests/` at
  the workspace's top as `<path>/<name>.test.ts`, mirroring the source path
  (`domain/tests/chat/chat.service.test.ts`), over the memory layers of the ports from
  `domain/testing` (one layer per port over a `Ref<Map>`, exported as
  `@app-template/domain/testing`, mirroring the port's contract, the index included), the
  identity `Transaction` from `infrastructure/testing` and the recording queue from
  `packages/testing`, needing no process outside vitest; a module folder holds no test;
  domain services, use cases and handlers each have a unit suite; repositories have none.
- **R18** — WHILE a workspace has adapters, THE SYSTEM SHALL test them in one `e2e/` at the
  workspace's top as `<path>/<name>.e2e.ts`, mirroring the source path, over a Postgres and a
  MiniStack the run starts for itself with Testcontainers, never the local stand or `.env`:
  the repositories, the relay, the migrations, `S3Bucket`, `AttachmentBucketS3` and the queue;
  S3 and SQS are real, no memory layer of a port. One journey in a root workspace `e2e/`
  runs `ApiLayer` and `WorkerLayer` in one process over the same containers and the model
  stub, from HTTP through the outbox, SQS and the worker back to HTTP; the apps have no
  `e2e/` of their own. The `e2e` project's one `globalSetup` starts both containers once per
  run and passes their addresses through `inject`; each test gets its own database copied
  from a migrated template and its own stage on MiniStack, whose bucket and queues it
  provisions. Test support lives only in a `testing/`: the workspace's, or a module's own when
  it serves that module alone (`infrastructure/db/testing`); `domain`, `infrastructure` and
  `application` export theirs as `@app-template/<workspace>/testing`.
- **R19** — WHEN tests are run, THE SYSTEM SHALL offer `make test-unit` (no Docker), `make
  test-e2e` (Docker running), and `make test` for both, from one `vitest.config.ts` with two
  `projects` split by folder and suffix (`tests/**/*.test.ts`, `e2e/**/*.e2e.ts`) and chosen
  by `--project`; `make check` runs both.
- **R22** — WHEN the ticket lands, THE SYSTEM SHALL have no `src/` folder in `apps/api`,
  `apps/worker` or `apps/web`: their modules, `layer.ts`, `main.ts`, `testing/` and `tests/`
  sit at the workspace's top like every other workspace's, with the `#api/*`,
  `#web/*` import maps, the `tsconfig` includes, the run scripts, the `make dev-*` targets and
  the Biome overrides moved with them.
- **R23** — WHEN `apps/web` is bundled, THE SYSTEM SHALL ship no domain service, port or adapter
  to the browser: `domain` keeps `"sideEffects": false` and one barrel per entity, and a check in
  `make check` builds the web bundle and fails on a service or port name in it.

### Language and rules

- **R20** — WHEN the ticket lands, THE SYSTEM SHALL define the architecture language in
  `docs/knowledge/glossary.md` (component, aggregate, model, read model, port, adapter, domain
  service, use case, handler, relay, outbox, job, unit test, e2e test, memory layer), each with
  the words to avoid, and the rules refer to those words.
- **R21** — WHEN the ticket lands, THE SYSTEM SHALL have rewritten to the new model
  `.claude/rules/use-cases.md` (as the layering rule), `naming.md` (`.port`; the `tests/` and
  `e2e/` folders, the `.test` and `.e2e` suffixes and their mirror rule; the three `./testing`
  exports; `.job` and `.llm` dropped), `effect-tests.md`,
  `effect-services.md`, the `CLAUDE.md` of `domain`, `application`, `infrastructure` and `apps`,
  the Biome override that lets `domain/tests/**` import `@effect/platform-bun`, and the
  knowledge docs `architecture.md` and `tooling.md`, with no line that restates the old model.

## Acceptance

| Req | How to verify |
|---|---|
| R1 | `ls domain/*/*.port.ts` lists chat, message, assistant, attachment and user ports; `grep -rn "Context.Service" infrastructure/` finds only adapters' own services (`Db`, `QueueTransport`), no port declaration |
| R2 | `ls application/*/*.service.ts` is empty; `grep -rln "DateTime.now\|Crypto.Crypto" domain/*/*.service.ts` lists the four services; `grep -rn "\.\(insert\|update\|delete\)(" application/ apps/` finds only the chat's `updatedAt` writes of the send and the settle, each one `set` and one `where`; review confirms no other repository write there |
| R3 | each `application/**/*.use-case.ts` imports at least two of: a second domain service, `AttachmentBucket`, `QueueClient`, `Assistant`, `sql.withTransaction` |
| R4 | `apps/api/chat/chat.handler.ts`: `list`, `get`, `rename`, `create` call `ChatService`; no use case of one call exists |
| R5 | `grep -rn "messages\.\(update\|insert\)" application/ apps/` is empty; the reply e2e test still shows the stages and snapshots |
| R6 | `ls apps/worker/chat/` shows `assistant-message.handler.ts`, `chat-title.handler.ts`; `find . -name "*.job.ts" -not -path "*/node_modules/*"` is empty |
| R7 | the send e2e test: after a send, the outbox holds both jobs in the send's transaction (a failed send writes none) |
| R8 | a unit test of `buildChatTitle` on a 300-grapheme text and on blank text; `ls infrastructure/chat/chat.llm.ts` fails; `AssistantLlm` holds the only prompt strings (`grep -rn "Suggest a title" .`) |
| R9 | `infrastructure/outbox/outbox.relay.ts` exports a `Layer` and imports no domain service or use case |
| R10 | `ls domain/chat application/chat` shows the files named; `find . -type d -name message` is empty |
| R11 | `grep -rn "ensureFound\|isInChat\|isTitledChat\|isOwnedBy" --include=*.ts .` is empty; `grep -rn "selectOne" domain/*/*.port.ts` lists chat, message and attachment |
| R12 | `make lint` green with a Biome `noNestedGen`-style check if one exists, else review: the five spots named read as one pipeline each |
| R13 | `grep -rn "unknown\|Struct.evolve" infrastructure/*/*.repository.ts` is empty; `infrastructure/db/columns.ts` exports the two types and the builder, used by chat, attachment and message repositories |
| R14 | `bun pm ls | grep -E "effect@|@effect/"` shows 4.0.6 everywhere; `make check` green |
| R15 | e2e on MiniStack: 0 bytes, exactly 5 MiB and 5 MiB + 1 upload as one `PutObject`, one `PutObject` and two parts; a 12 MiB file uploads as three parts and `get` reads 12 MiB; a stream that fails mid-way leaves no object and no open multipart upload; `wc -l infrastructure/attachment/attachment.bucket.ts` under 80 |
| R16 | the migration alters `outbox.body` to `jsonb`; the relay e2e test still delivers the job |
| R17 | with Docker stopped, `make test-unit` passes; `find . -path "*/tests/*.test.ts" -not -path "*/node_modules/*"` lists a suite per domain service, use case and handler, each under `<workspace>/tests/<module>/`; `find . -name "*.test.ts" -not -path "*/tests/*" -not -path "*/node_modules/*"` is empty; `ls domain/testing` shows one `.fake.ts` per entity plus the fixtures |
| R18 | with Docker running and the local stand down, `make test-e2e` passes; `find . -name "*.e2e.ts" -not -path "*/node_modules/*"` lists the repositories, the relay, the migrations, the queue, `S3Bucket` and `AttachmentBucketS3` under `<workspace>/e2e/<module>/` and `e2e/chat.e2e.ts` at the root, nothing under `apps/`; `grep -rln "Memory\b" --include=*.e2e.ts .` is empty; `find . -name "*.harness.ts" -o -name "*.fake.ts" -o -name "*.fixture.ts" -o -name "*.setup.ts"` lists only paths with a `testing/` segment; two e2e runs in two worktrees at once both pass |
| R19 | `make help` lists the three test targets; one `vitest.config.ts` declares two `projects`; `bun run vitest run --project unit` runs only `*.test.ts` under `tests/`; `make check` runs `test` |
| R22 | `ls apps/*/src` fails; `make dev-api`, `make dev-worker`, `make dev-web` start; `make check` green; `grep -rn "src/" apps/*/package.json apps/*/tsconfig.json biome.json Makefile` finds nothing for the three apps |
| R23 | `make check` runs the bundle check; a probe that imports `ChatService` from a web feature turns it red; `grep -n sideEffects domain/package.json` shows `false` |
| R20 | `docs/knowledge/glossary.md` has the section with the fifteen terms; `grep -rn "interactor\|orchestrator\|controller" .claude/rules/` is empty |
| R21 | `grep -rn "application.*service\|\.job\b\|chat.llm" .claude/rules/ */CLAUDE.md docs/knowledge/` finds only the glossary's `_Avoid_` lines |

## Open questions

None. The two the feature phase left (per-test isolation on MiniStack, deterministic ids) are
settled in [architecture.md › Decisions](./architecture.md#decisions) (D8, D13).
