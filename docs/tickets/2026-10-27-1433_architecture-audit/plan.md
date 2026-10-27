# Architecture audit — plan

> Ticket: `2026-10-27-1433_architecture-audit` · Requirements: [feature.md](./feature.md) · Design: [architecture.md](./architecture.md)

## How to run this plan

- Branch `refactor/architecture-audit`; one commit per step, after the user's OK (`/ticket-implement`).
- Each step leaves `make check` green and fits one fresh session (≤ ~400 changed lines).
- A deviation is recorded in the step's findings, and in `architecture.md › Decisions` when it is a
  decision.
- A step that moves files does it with `git mv`, so a moved suite's diff shows its edits alone.
- A step that introduces a suffix, a folder or an export updates the matching line of
  `.claude/rules/naming.md` in the same commit; S23 and S24 rewrite the rules and the docs whole.
- A knowledge-doc section a step changes the behaviour of is listed in that step's **Files**.
- Steps marked *parallel* may run at once in worktrees (`ticket-implement › Parallel steps`)
  when their only overlap is a line in a manifest, `biome.json` or `bun.lock`.
- The e2e steps need Docker running; the user starts it by hand. The local stand (`make up`)
  is needed only where a *Verify* says `make dev-*`.
- Every step writes its code by `.claude/rules/effect-style.md › Composition`: business logic in
  `Effect.gen` / `Effect.fn`, plumbing in `pipe`; the review checks it.

## Steps

### Foundation

#### S1 — Pin effect at 4.0.6

- **Goal:** every `effect` and `@effect/*` dependency at 4.0.6, alone, so a change of layer
  memoization shows up before the refactor (R14; the first Risks row).
- **Blocked by:** none.
- **Files:** `package.json` (`catalogs.effect`), `bun.lock`, any source a 4.0.6 change breaks.
  `repos/effect` is vendored at 4.0.5; `make vendor-effect` pulls 4.0.6 and makes a squash
  commit of its own, so it runs after this step's commit, on the user's OK.
- **Test first:** `config only`.
- **Verify:** `bun pm ls --all | grep -E "── (effect|@effect/(platform|sql|vitest))[^@]*@"` shows 4.0.6 everywhere; `make check`.
- **Model:** opus medium
- **Status:** done
- **Findings:** the Verify check was wrong twice: `bun pm ls` without `--all` lists no effect
  package, and the pattern `@effect/` also caught `@effect/tsgo@0.53.2`, which versions apart
  and R14 does not name. The check now reads `--all` with the four packages' pattern, here and
  in `feature.md › Acceptance › R14`. No source change was needed for 4.0.6.

#### S2 — Split the suites into `tests/` and `e2e/`, two vitest projects, three make targets

- **Goal:** every suite sits at the top of its workspace under `tests/` (no Docker) or `e2e/`
  (Docker) with the matching suffix, chosen by `--project`; `make test-unit`, `make test-e2e`,
  `make test` (R17 and R18 layout, R19, D11). The suites that still need Docker today but
  become unit suites later (`application`, `apps/api`) go to `e2e/` for now and move again in
  the step that rewrites them, so the folder never lies.
- **Blocked by:** S1.
- **Files:** `vitest.config.ts` (`projects`: `unit` on `**/tests/**/*.test.ts`, `e2e` on
  `**/e2e/**/*.e2e.ts` with the `globalSetup`; the shared `exclude` and `sequence`; the root's
  own `globalSetup` goes, since an inline project extends the root and would start Postgres
  for the unit project too); `Makefile` (`test-unit`, `test-e2e`, `test`, `check`, `.PHONY`,
  the `##` help lines, through `bun --bun vitest run`; the root `test` script and CI's
  `bun run test` keep running both projects);
  `git mv infrastructure/db/testing/postgres.setup.ts infrastructure/testing/e2e.setup.ts`
  (Postgres only; MiniStack joins in S18); `biome.json` (the `domain/**/*.test.ts` override
  becomes `domain/tests/**`); `.claude/rules/naming.md` (the `.test` row, a `.e2e` row, the
  `tests/` and `e2e/` folders); `.claude/rules/effect-tests.md` (its `paths:` gain
  `**/*.e2e.ts`, `**/tests/**` and `**/e2e/**`; the "colocated" line says the two folders);
  `infrastructure/CLAUDE.md` (`db/` no longer holds the `globalSetup`);
  `docs/knowledge/tooling.md › Tests` (the commands, the two projects, the setup's new path);
  the `help` target pattern in `Makefile` admits digits; `apps/api/tsconfig.json` (`include`
  gains `e2e/**/*.ts`); the moved paths in `domain/CLAUDE.md`,
  `docs/knowledge/architecture.md`, `aws.md` and `database.md`.
  Moves, pure suites to `<ws>/tests/<path>/<name>.test.ts`: `domain/chat/chat.model`,
  `domain/chat/chat.service`, `domain/attachment/attachment.model`,
  `domain/attachment/attachment.service`, `domain/user/user.model`,
  `infrastructure/shared/resources`, `packages/config/config`. Docker suites to
  `<ws>/e2e/<path>/<name>.e2e.ts`: the eleven of `infrastructure` (`attachment/attachment.entity`,
  `attachment/attachment.repository`, `chat/chat.entity`, `chat/chat.repository`,
  `chat/message.entity`, `chat/message.repository`, `db/db.client`, `db/migrate`,
  `outbox/outbox.relay`, `shared/queue.client`, `user/user.repository`), the seven of
  `application` (`attachment/attachment.service`, `chat/assistant-message.job`,
  `chat/chat-title.job`, `chat/chat.service`, `chat/delete-chat.use-case`,
  `chat/send-message.use-case`, `user/user.service`), the four of `apps/api`
  (`apps/api/e2e/<entity>/<entity>.handler.e2e.ts`, at the workspace's top),
  `packages/queue/queue.test.ts` → `packages/queue/e2e/queue.e2e.ts`.
- **Test first:** `config only`.
- **Verify:** with Docker stopped, `make test-unit` passes; `make test-e2e` passes;
  `bun --bun vitest run --project unit` lists only files under `tests/`;
  `find . -name "*.test.ts" -not -path "*/tests/*" -not -path "*/node_modules/*" -not -path
  "./repos/*"` is empty; `make help` lists the three targets; `make check`.
- **Model:** opus medium
- **Status:** done
- **Findings:**
  - `make help` matched `^[a-zA-Z_-]+:`, so `test-e2e` was missing; the pattern now admits
    digits. `apps/api/tsconfig.json` needed `e2e/**/*.ts` or the moved api suites fell out of
    `tsc -b`; S3 rewrites the line. Four docs named the old test paths; only the paths changed,
    S23 and S24 rewrite the sections.
  - `architecture.md › Contracts` and `feature.md › Acceptance › R19` said `bun run vitest
    run`; both now say `bun --bun vitest run`, as the plan and `tooling.md` do.
  - "With Docker stopped" was not run: the implementer may not stop Docker. In its place, the
    `unit` project has no `globalSetup` and no file under `tests/` names a container helper.
  - `effect-tests.md` keeps only the folder globs; `**/*.test.ts` and `**/*.e2e.ts` fell
    under `**/tests/**` and `**/e2e/**`. `naming.md` is 83 lines; S23 trims it.

#### S3 — Drop `src/` from the three apps

- **Goal:** `apps/api`, `apps/worker` and `apps/web` have the shape of every other workspace
  (R22).
- **Blocked by:** S2. *Parallel* with S4, S5, S6.
- **Files:** `git mv apps/<app>/src/* apps/<app>/` for the three apps; `apps/*/package.json`
  (`imports`: `#api/*` → `./*.ts`, `#worker/*`, `#web/*`, `#web/index.html` → `./index.html`;
  the `dev`, `debug`, `start` scripts on `main.ts`); `apps/*/tsconfig.json`
  (`include: ["**/*.ts"]`); `biome.json` (`apps/web/src/main.ts` → `apps/web/main.ts`);
  `apps/CLAUDE.md` (the two `src/` lines); `docs/knowledge/architecture.md` (the
  `apps/web/src/main.ts` rows and the dependency table's row name).
- **Test first:** `config only`.
- **Verify:** `ls apps/*/src` fails; `grep -rn "src/" apps/*/package.json apps/*/tsconfig.json
  biome.json Makefile` finds nothing for the three apps; `make check`; with the stand up,
  `make dev-api`, `make dev-worker` and `make dev-web` start and answer `GET /health`.
- **Model:** opus medium
- **Status:** done
- **Findings:** `README.md`, `docs/knowledge/roadmap.md`, `tooling.md` and `http-api/CLAUDE.md`
  named `apps/<app>/src/` paths too; only the paths changed. The api's `include` collapsed to
  `**/*.ts`, which covers the `e2e/` line S2 added. `make dev-api` answered `GET /health` 200
  and `make dev-worker` logged `worker started` on the local stand.

#### S4 — Type the repositories' write mapping once

- **Goal:** one `SetColumns`/`WhereColumns` pair and one `buildSet`/`buildWhere` in
  `infrastructure/db/columns.ts`, used by the chat, message and attachment repositories; no
  `unknown`, no `Struct.evolve(Struct.pick(…))` (R13).
- **Blocked by:** S2. *Parallel* with S3, S5, S6.
- **Files:** `infrastructure/db/columns.ts` (the two types over `PgUpdateSetSource<Table>[K]`
  and `SQL | undefined`, the two builders over `Arr.reduce`), `infrastructure/chat/chat.repository.ts`,
  `infrastructure/chat/message.repository.ts`, `infrastructure/attachment/attachment.repository.ts`;
  `docs/knowledge/database.md › Repositories`.
- **Test first:** each `*RepositoryPg` on `DbTest` (`infrastructure/e2e/chat/chat.repository.e2e.ts`,
  `attachment.repository.e2e.ts`): the `update(set, where)` cases stay green; the red is a type
  probe, a column mapper answering `42` in `chat.repository.ts` fails `make typecheck` (removed
  before the report).
- **Verify:** `grep -rn "unknown\|Struct.evolve" infrastructure/*/*.repository.ts` is empty;
  `make check`.
- **Model:** fable high
- **Status:** done
- **Findings:**
  - `Record.map` collapses the mappers into one value type, so the builders fold
    `Struct.keys(columns)` with `Arr.reduce` into a row typed `SetRow`; it is the one cast-free
    effect form that typechecks. Neither form checks a value inside the generic builder: the
    checks live in `SetColumns` at the call site, where the `title: () => 42` probe fails.
  - A set column is `PgUpdateSetSource<Table>[K & keyof PgUpdateSetSource<Table>]`, so a field
    the table has no column for demands `never` and fails at its mapper.
  - The repositories name the builders' results `encodeSet` and `encodeWhere`; `set` and
    `where` would shadow `update(set, where)`. The type parameter is `Fields`, not `Set`.

#### S5 — The outbox body as `jsonb`, the relay's loop as one pipeline

- **Goal:** the outbox stores the job's encoded JSON value in a `jsonb` column with no index on
  it; `OutboxRelay` reads top to bottom and holds no rule (R16, R9, R12 for the relay).
- **Blocked by:** S2. *Parallel* with S3, S4, S6.
- **Files:** `infrastructure/outbox/outbox.entity.ts` (`body: jsonb().$type<…>()`);
  `infrastructure/db/migrations/<stamp>_outbox_body_jsonb/` from `make migration
  NAME=outbox_body_jsonb`, its SQL set to `ALTER TABLE outbox ALTER COLUMN body TYPE jsonb USING
  body::jsonb`; `infrastructure/shared/queue.client.ts` (`QueueClientOutbox` stores the job
  encoded through its definition's schema, a JSON value, not the SQS string);
  `infrastructure/outbox/outbox.relay.ts` (the relay stringifies the value for the transport;
  `relayBatch` and `poll` as one pipeline each, no `Effect.gen` inside the layer's `Effect.gen`);
  `docs/knowledge/database.md › The outbox`.
- **Test first:** `OutboxRelay` on `DbTest` (`infrastructure/e2e/outbox/outbox.relay.e2e.ts`): the
  recording transport receives the same body string for a row stored as `jsonb`; red while the
  column is `text` and the entity says `jsonb`, through `make migration-check`.
- **Verify:** `make migration-check`; `make test-e2e`; `grep -n jsonb
  infrastructure/outbox/outbox.entity.ts`; `make check`.
- **Model:** fable high
- **Status:** done
- **Findings:**
  - The migration keeps drizzle-kit's text (`SET DATA TYPE jsonb USING "body"::jsonb`), the
    statement the Files spell as `TYPE jsonb`. `infrastructure/e2e/shared/queue.client.e2e.ts`
    asserted the stored body as a string and now expects the JSON value.
  - One codec: `packages/queue` exports `encodeJob` (the JSON value an outbox row stores) and
    keeps `encodeBody` private, both `pipe(message, encodeWith(<codec>))`; `encodeBody` encodes
    through `buildJsonCodec`, the codec `consume` decodes with. The relay keeps `JSON.stringify`,
    since its input is already a `Schema.Json`.
  - The relay e2e asserts the sent body parses to the job: `jsonb` stores keys in its own order,
    so the string equalled the encoded job only by chance.
  - R12: `poll` lets an interrupt-only cause through with `catchCauseIf`, paired with
    `tapCauseIf`; `effect-style.md › Errors and logs` now says so, on the user's OK. The delete of
    a non-empty batch is `Arr.match`, its query ending in `Effect.asVoid`, without which
    `Effect.tap` cannot infer one type from the two arms.
  - On the user's OK, `effect-style.md` gained `## Composition` (business logic in gen, plumbing
    in pipe, flat, data-last, subject-last arity); the file is 91 lines, past the ~80 guide,
    until S23. `columns.ts` (S4) follows it: `buildSet` folds with `Object.assign` on a fresh
    row, since `Struct.pick` + `Struct.evolve` and `Record.fromEntries` do not typecheck under the
    generic `Fields` and the spread is quadratic.
  - For S7, S10 and S11: wrap the `Where` and `Set` types in `Types.Simplify` so a compiler
    error shows one flat object, and use `Types.Mutable` for the memory fakes' rows.

#### S5b — Compose the modules no later step rewrites

- **Goal:** the code no later step rewrites reads by `effect-style.md › Composition` (R12).
- **Blocked by:** S5.
- **Files:** `packages/queue/queue.ts` (`consume`, `heartbeat`, `settle`, `run`, `worker`),
  `packages/config`, `packages/llm`, `packages/aws`, `http-api`, the handlers of `apps/api` and
  `apps/web`, `infrastructure/user/user.repository.ts`, `deployment`. No behaviour changes; past
  ~400 lines the step splits into S5b (packages) and S5c (`http-api`, apps, `deployment`).
- **Test first:** `config only` — the existing suites over these modules stay green unchanged.
- **Verify:** `make check`; `git diff --stat` shows no test file changed.
- **Model:** fable high
- **Status:** done
- **Findings:**
  - The step fit one commit of ~150 lines; S5c is not created.
  - `http-api` (declarations only), `infrastructure/user/user.repository.ts`, and `settle` and
    `consume` in `packages/queue` were checked and already read by the rule; `deployment/aws`
    stays flat Pulumi code.
  - The stub's split `/(?= )/` drops the empty first delta the old code sent for a text that
    starts with a space; the stub only streams `cannedReply`, which does not.
  - Left for `/ticket-verify`: `heartbeat` logs through `Effect.tapCause`, not `tapCauseIf`
    (changing it changes what is logged when the handler wins the race), and
    `packages/queue/queue.transport.ts › makeSqs` keeps a ternary and a lambda holding a `.pipe`.

### The domain

#### S6 — Split the `chat` component by entity; ports in `.port.ts`, rules in `.model.ts`

- **Goal:** every port in a `<entity>.port.ts`, every pure operation beside the model it acts on,
  one file per entity, the barrels unchanged for their importers (R1, R10, D2).
- **Blocked by:** S2. *Parallel* with S3, S4, S5.
- **Files:** from `domain/chat/chat.service.ts` (then *gone* until S10): `domain/chat/chat.port.ts`
  (`ChatRepository`, `ChatSet`, `ChatWhere`), `domain/chat/message.port.ts` (`MessageRepository`,
  `MessageWhere`), `domain/chat/assistant.port.ts` (`Assistant`, `AssistantTurn` as
  `architecture.md › Ports` writes them; no adapter yet), `domain/chat/chat.model.ts` gains
  `buildChat`; `domain/chat/message.model.ts` takes `Message`, `MessageDetail`, `MessageStage`,
  `ActiveMessage`, `MessageFailure`, `MessageInput` from `chat.model.ts` and the builders,
  `isActiveMessage`, `ensureChatAcceptsMessage`, `ensureMessageInput` and the transitions from
  `chat.service.ts`; `domain/chat/message.error.ts` takes `MessageNotFoundError`,
  `MessageInputInvalidError`, `MessageStageInvalidError` from `chat.error.ts`. Likewise
  `domain/attachment/attachment.service.ts` → `attachment.port.ts` (the two ports and the
  `Set`/`Where` types) and `attachment.model.ts` (`buildAttachment`, `unboundLifetime`,
  `isVisibleTo`, `ensureBindable`); `domain/user/user.service.ts` → `user.port.ts`
  (`UserRepository`) and `user.model.ts` (`buildUser`, `isOwnedBy` until S10). The three
  `index.ts`; the suites `git mv domain/tests/chat/chat.service.test.ts
  domain/tests/chat/message.model.test.ts` (the chat cases into `chat.model.test.ts`),
  `git mv domain/tests/attachment/attachment.service.test.ts
  domain/tests/attachment/attachment.model.test.ts`; `.claude/rules/naming.md` (a `.port` row;
  the `.model` row gains the pure operations; the `.service` row's domain half becomes "the
  aggregate's domain service over its ports", which S8–S11 fill); `domain/CLAUDE.md` (ports
  live in `<entity>.port.ts`, not `.service.ts`).
- **Test first:** `config only` (a move: the pure suites travel with their operations).
- **Verify:** `ls domain/*/*.port.ts` lists chat, message, assistant, attachment, user;
  `grep -rn "Context.Service" domain/*/*.model.ts` is empty; `make check`.
- **Model:** opus medium
- **Status:** done
- **Findings:**
  - `message.model.ts` and `message.error.ts` would import each other (the transitions fail with
    `MessageStageInvalidError`, whose `from`/`to` are `MessageStage`), so the stage schemas sit
    in `domain/chat/message-stage.model.ts`, on the user's choice; D2 and Structure say so.
  - `attachment.model.test.ts` already existed, so the `isVisibleTo` and `ensureBindable` cases
    were appended to it and `attachment.service.test.ts` removed. `chat.service.test.ts` held
    message cases only and moved whole to `message.model.test.ts`; `chat.model.test.ts` is
    unchanged. `isTitledChat` sits in `chat.model.ts`, `isInChat` in `message.model.ts`.
  - `isOwnedBy` sits in `domain/shared/guard.ts` until S10: in `user.model.ts` it made
    `attachment.model.ts` import another aggregate's model, which `naming.md`'s `.id` row
    forbids. `application/chat/chat.service.ts` changed one import line for it.
  - The `Attachment` type in `MessageDetail` predates S6 (it was in `chat.model.ts`); S23 states
    whether a model may name another aggregate's model type.
  - ~470 changed lines, ~50 of them new (`assistant.port.ts`, barrels, docs); the rest moved.

#### S7 — Memory layers and fixtures in `domain/testing`

- **Goal:** one memory layer per port over a `Ref<HashMap>`, mirroring the port's contract and the
  index, exported as `@app-template/domain/testing` with the fixtures (R17, D6, D13).
- **Blocked by:** S6.
- **Files:** `domain/testing/chat.fake.ts` (`ChatRepositoryMemory`, `MessageRepositoryMemory`:
  `insert` answers `false` on a second active message of a chat, `update` honours its `Where`,
  `delete` dies while an attachment is bound to one of the chat's messages); the maps are
  services (`ChatRows`, `MessageRows`, `AttachmentRows`, `UserRows`), so one layer reads
  another's rows for `selectDetail` and the cascade; `domain/testing/attachment.fake.ts`
  (`AttachmentRepositoryMemory`; `AttachmentBucketMemory` moved from
  `application/testing/attachment.fake.ts`); `domain/testing/user.fake.ts`
  (`UserRepositoryMemory`); `RepositoryStackMemory` (the four repositories with their rows) in
  `domain/testing/index.ts`; `git mv application/testing/{chat,user,attachment}.fixture.ts
  domain/testing/`; `domain/package.json` (`exports["./testing"]`, `devDependencies`
  `@effect/platform-bun`); `biome.json` (`domain/tests/**` may import `@effect/platform-bun`);
  `application/testing/chat.harness.ts`, `db.harness.ts`, `index.ts` repointed to the moved
  fixtures and bucket; `.claude/rules/naming.md` (the `./testing` exports line; a `<Entity>Rows`
  line under test support: the map service a memory layer keeps its rows in).
- **Test first:** test support only (`effect-tests.md › Test support`): no suite of its own;
  S8–S10's suites are its first consumers, and each rule above has its e2e twin named in S9
  and S10.
- **Verify:** `ls domain/testing` shows the three `.fake.ts`, the three `.fixture.ts` and
  `index.ts`; `make check`.
- **Model:** fable high
- **Status:** done
- **Findings:**
  - The maps are `Ref<HashMap>`, not `Ref<Map>`: a write is one `Ref.modify` that replaces the
    row (`new Chat({ ...row, ...set })`), so `Types.Mutable` from S5's finding goes unused. D6
    says so; R17 reads "map" as the kind, so `feature.md` is unchanged. `AttachmentObjects`
    moved to a `Ref<HashMap>` too, and its `Buffer.concat` to `Stream.mkUint8Array` (no Node
    API in `domain/`).
  - The bucket layer kept the name `AttachmentStoreMemory`, since the port is still
    `AttachmentStore` and no step renamed it while S9, S10, S16 and S20 already wrote
    `AttachmentBucket`; the new S7c renames the port.
  - `Types.Simplify` wraps `ChatSet`, `ChatWhere`, `AttachmentSet`, `AttachmentWhere`
    (`chat.port.ts`, `attachment.port.ts`), per S5's finding.
  - Beyond **Files**: `domain/testing/rows.ts` (`matches(where)`, shared by three fakes, as
    `infrastructure/testing/rows.ts`); the seven `application/e2e/**` suites that imported the
    moved fixtures by path.
  - `MessageRepositoryMemory.update` does not check the one-active-message index. Unreachable:
    every transition in `message.model.ts` starts from an active message, so an `update` never
    turns an inactive one active.
  - The fakes read by `› Composition` (round S7.2): one snapshot of the joined rows per read,
    flat pipes. Probe suites, deleted after, checked each rule; the first real consumers are S8–S10.
  - On the user's OK, two rename steps follow: S7b (test-support files `<entity>.test-<role>.ts`,
    `<Port>Memory` → `<Port>Test`) and S7c (`AttachmentStore` → `AttachmentBucket`). Later steps
    still say `…Memory` and `AttachmentBucketMemory`; S7b rewrites those names in this plan and
    `architecture.md`.

#### S7b — Test-support names searchable as test-only

- **Goal:** every test-support file is `<entity>.test-<role>.ts` and every test-only layer ends in
  `Test`, so `**/*.test-*.ts` and `\w+Test\b` find them all (R17, R21).
- **Blocked by:** S7.
- **Files:** `git mv` every `testing/**` file: `.fake` → `.test-fake`, `.fixture` →
  `.test-fixture`, `.harness` → `.test-layer`, `.setup` → `.test-setup`; the imports, `vitest.config.ts`
  (`globalSetup`) and `Makefile` that name them; the layers `<Port>Memory` → `<Port>Test`
  (`ChatRepositoryTest`, `MessageRepositoryTest`, `AttachmentRepositoryTest`, `UserRepositoryTest`,
  `AttachmentStoreTest`, `RepositoryStackTest`); `.claude/rules/naming.md › Files` and `› Symbols`,
  `.claude/rules/effect-tests.md` (the roles and the two globs); the `…Memory` names and the four
  role suffixes in this plan's later steps and in `architecture.md` (`TransactionMemory` →
  `TransactionTest`). `record<Thing>()` and `<Entity>Rows` keep their names.
- **Test first:** `config only` — the suites stay green unchanged but for imports.
- **Verify:** `git ls-files '*/testing/*' | grep -vE '\.test-(fake|fixture|layer|setup)\.ts$|/(index|rows)\.ts$'`
  is empty; `git grep -nE '\b[A-Z]\w+Memory\b' -- ':!repos' ':!docs/tickets/*/verification.md'`
  is empty; `make check`.
- **Model:** opus medium
- **Status:** todo

#### S7c — The port `AttachmentStore` is `AttachmentBucket`

- **Goal:** the attachment's bytes port carries the name the later steps use: `AttachmentBucket`,
  its adapter `AttachmentBucketS3`, its fake `AttachmentBucketTest` (R17, D9).
- **Blocked by:** S7b.
- **Files:** `domain/attachment/attachment.port.ts`; `git mv
  infrastructure/attachment/attachment.storage.ts infrastructure/attachment/attachment.bucket.ts`,
  `infrastructure/attachment/index.ts`; `domain/testing/attachment.test-fake.ts`
  (`AttachmentObjects` named for the bucket); its users in `application/` and
  `apps/api/testing`; `.claude/rules/naming.md` (`.storage` → `.bucket`),
  `.claude/rules/use-cases.md`; `docs/knowledge/aws.md`, `docs/knowledge/glossary.md`.
- **Test first:** `config only` — a rename; the suites stay green.
- **Verify:** `git grep -n 'AttachmentStore\|\.storage\b' -- ':!repos' ':!docs/tickets'` is empty;
  `make check`.
- **Model:** opus medium
- **Status:** todo

#### S8 — `UserService` to the domain

- **Goal:** the user's rules in `domain/user/user.service.ts`, with a unit suite over
  `UserRepositoryMemory`; `application/user` gone (R2, R17).
- **Blocked by:** S7c.
- **Files:** `git mv application/user/user.service.ts domain/user/user.service.ts` (key
  `@app-template/domain/user/UserService`; `isOwnedBy` stays in `user.model.ts` until S10);
  `domain/user/index.ts`; `application/user/index.ts` *gone*, `application/package.json`
  (`exports["./user"]` gone); `apps/api/layer.ts`, `apps/api/shared/security.ts` (import from
  `@app-template/domain/user`); `git mv application/e2e/user/user.service.e2e.ts
  domain/tests/user/user.service.test.ts` over `UserRepositoryMemory` and `BunCrypto.layer`.
- **Test first:** `UserService` over the memory layer (`domain/tests/user/user.service.test.ts`):
  `ensure` with no secret creates a user and a secret; a valid secret returns its user;
  `authenticate` on an unknown secret fails `UserUnknownError`. Red: `@app-template/domain/user`
  has no `UserService` yet.
- **Verify:** `ls application/user` fails; `make test-unit`; `make check`.
- **Model:** fable high
- **Status:** todo

#### S9 — `AttachmentService` to the domain; ownership as a `Where` field

- **Goal:** the attachment's rules in `domain/attachment/attachment.service.ts`;
  `selectOne({ id, userId })` replaces `selectById` plus `ensureFound`/`isOwnedBy`; `isExpired`
  stays the one predicate; the upload reads as one pipeline (R2, R11, R12, D10).
- **Blocked by:** S8, S4.
- **Files:** `git mv application/attachment/attachment.service.ts
  domain/attachment/attachment.service.ts` (key `@app-template/domain/attachment/AttachmentService`);
  `domain/attachment/attachment.port.ts` (`selectOne(where: { id; userId? })`; the batch
  `update`'s `AttachmentWhere` keeps its array `id`); `domain/attachment/attachment.model.ts`
  (`isVisibleTo` and `ensureBindable` go: `get` reads `selectOne({ id, userId })` and filters
  `isExpired`; `bind` checks the values in hand with `Predicate.Struct({ userId: … })` inline, the
  first missing id in the order asked); `infrastructure/attachment/attachment.repository.ts`
  (`selectOne` through `buildWhere`); `domain/testing/attachment.fake.ts` (the same `Where`);
  `application/attachment/index.ts` *gone*, `application/package.json`; `apps/api/layer.ts`,
  `apps/api/attachment/attachment.handler.ts`, `application/chat/delete-chat.use-case.ts`,
  `send-message.use-case.ts`, `application/testing/chat.harness.ts` (imports);
  `git mv application/e2e/attachment/attachment.service.e2e.ts
  domain/tests/attachment/attachment.service.test.ts` over `AttachmentRepositoryMemory` and
  `AttachmentBucketMemory`; `infrastructure/e2e/attachment/attachment.repository.e2e.ts` gains
  the twin: `selectOne({ id, userId })` of a stranger's attachment is none.
- **Test first:** `AttachmentService` over the memory layers: `get` of a stranger's attachment
  and of an expired unbound one is `AttachmentNotFoundError`; `bind` names the first missing id
  in the order asked; an upload whose second file's stream fails leaves no attachment and no
  bytes.
- **Verify:** `grep -rn "isVisibleTo\|ensureFound" domain/attachment` is empty;
  `ls application/attachment` fails; `make test-unit`; `make check`.
- **Model:** fable high
- **Status:** todo

#### S10 — `ChatService` to the domain; the one-line helpers gone

- **Goal:** the chat's rules in `domain/chat/chat.service.ts`; `ChatWhere` and `MessageWhere`
  carry ownership, so `ensureFound`, `isOwnedBy`, `isInChat`, `isTitledChat` and
  `domain/shared` go; the api's one-method flows call the domain service (R2, R11, R4, D10).
  `getMessage`, `addUserMessage`, `addAssistantMessage` and `settleReply` stay on the service
  until S11 and S15 take them.
- **Blocked by:** S9.
- **Files:** `git mv application/chat/chat.service.ts domain/chat/chat.service.ts` (key
  `@app-template/domain/chat/ChatService`); `domain/chat/chat.port.ts` (`ChatWhere` gains
  `userId`; `selectOne(where)` and `selectDetail(where)` replace the `id` reads);
  `domain/chat/message.port.ts` (`MessageWhere = { id } & Partial<{ chatId; userId }>` for
  `selectOne`/`selectDetail`; the stage condition of `update` becomes `MessageStageWhere`);
  `domain/chat/chat.model.ts` (`isTitledChat` gone), `message.model.ts` (`isInChat` gone),
  `domain/user/user.model.ts` (`isOwnedBy` gone), `domain/shared/` *gone* with its export;
  `infrastructure/chat/chat.repository.ts`, `message.repository.ts` (`userId` as the nested
  relation filter `{ chat: { userId } }`, `chatId` as a column, through `buildWhere`);
  `domain/testing/chat.fake.ts`; `application/chat/*.use-case.ts`, `*.job.ts`,
  `application/chat/index.ts`, `application/testing/chat.harness.ts`, `apps/api/chat/chat.handler.ts`,
  `apps/api/layer.ts`, `apps/worker/layer.ts` (imports, `ChatService.layer` from the domain);
  `git mv application/e2e/chat/chat.service.e2e.ts domain/tests/chat/chat.service.test.ts` over
  the memory layers; the twins in `infrastructure/e2e/chat/chat.repository.e2e.ts` and
  `message.repository.e2e.ts` (a stranger's chat and another chat's message read as none).
- **Test first:** `ChatService` over the memory layers: `get` of a stranger's chat is
  `ChatNotFoundError`; `rename` moves `updatedAt`; `updateTitle` on a titled chat is
  `ChatTitledError`; `findSendable` refuses a busy chat and says `opensChat` on an empty one.
- **Verify:** `grep -rn "ensureFound\|isInChat\|isTitledChat\|isOwnedBy" --include=*.ts .` is
  empty; `ls domain/shared` fails; `grep -rn "selectOne" domain/*/*.port.ts` lists chat,
  message and attachment; `make check`.
- **Model:** fable high
- **Status:** todo

#### S11 — `MessageService`: the message's writes leave `ChatService`

- **Goal:** `MessageService` in `domain/chat/message.service.ts` owns the message's builders and
  every stage move; the send's chat `updatedAt` write becomes the use case's own rule-free
  repository call (R2, R5, R10, D1).
- **Blocked by:** S10.
- **Files:** `domain/chat/message.service.ts` (`get`, `addUserMessage`, `addAssistantMessage`,
  `prepare`, `generate`, `snapshot`, `complete`, `fail` as `architecture.md › Domain services`
  writes them; key `@app-template/domain/chat/MessageService`); `domain/chat/message.error.ts`
  (`MessageMovedError`); `domain/chat/chat.service.ts` (`getMessage`, `addUserMessage`,
  `addAssistantMessage` gone; `settleReply` stays until S15); `domain/chat/index.ts`;
  `application/chat/send-message.use-case.ts` (`chats.update({ updatedAt: sendable.at },
  { id: chatId })` then `ChatNotFoundError`; `messageService.addUserMessage`);
  `apps/api/chat/chat.handler.ts` (`getMessage` → `MessageService.get`); `apps/api/layer.ts`,
  `apps/worker/layer.ts` (`MessageService.layer`); `domain/tests/chat/message.service.test.ts`;
  `domain/tests/chat/chat.service.test.ts` (the moved cases).
- **Test first:** `MessageService` over the memory layers: `addAssistantMessage` on a busy chat
  is `ChatBusyError`; `prepare` of a completed message is `MessageStageInvalidError`; `complete`
  after the stored message moved is `MessageMovedError`; `snapshot` writes the text only while
  stored at `generating`; `get` of another chat's message is `MessageNotFoundError`.
- **Verify:** `ls domain/chat` shows the nine files of R10; `make test-unit`; `make check`.
- **Model:** fable high
- **Status:** todo

### The use cases

#### S12 — `Transaction` and the use cases' unit suites

- **Goal:** use cases run their writes through `Transaction.run` and have unit suites over the
  memory layers, `TransactionMemory` and a recording queue (R3, R17, D5).
- **Blocked by:** S11.
- **Files:** `infrastructure/db/db.client.ts` (`Transaction`, `Transaction.layer` over
  `SqlClient`, `SqlError` a defect); `infrastructure/db/index.ts`;
  `infrastructure/db/testing/transaction.fake.ts` (`TransactionMemory = Layer.succeed(Transaction,
  { run: identity })`); `git mv infrastructure/testing/db-test.ts
  infrastructure/db/testing/db.harness.ts` (`DbTest`, `flipSqlError`; the e2e suites' imports);
  `infrastructure/testing/index.ts` and `infrastructure/package.json` `exports["./testing"]`
  (`DbTest`, `TransactionMemory`); `packages/testing/queue.fake.ts` (`recordQueue()` →
  `{ sent, layer }`, a `QueueTransport` over a `Ref`) and `packages/testing/index.ts`;
  `application/chat/send-message.use-case.ts`, `delete-chat.use-case.ts` (`Transaction.run` as
  the `Effect.fn` pipeable, no `sql.withTransaction`, no `catchTag('SqlError')`);
  `application/testing/chat.harness.ts` (`ChatTest`: the use cases over `RepositoryStackMemory`,
  `AttachmentBucketMemory`, `TransactionMemory`, `QueueClient.layer` over `recordQueue()`,
  `BunCrypto.layer`; `chat` and the users arranged through the memory ports);
  `application/testing/db.harness.ts` *gone*; `application/testing/index.ts`;
  `apps/api/testing/api.harness.ts` (`DbTest` from `@app-template/infrastructure/testing`,
  `AttachmentBucketMemory` from `@app-template/domain/testing`); `apps/api/layer.ts`,
  `apps/worker/layer.ts` (`Transaction.layer`); `git mv
  application/e2e/chat/send-message.use-case.e2e.ts
  application/tests/chat/send-message.use-case.test.ts`, the same for `delete-chat`;
  `.claude/rules/naming.md` (the three `./testing` exports).
- **Test first:** the use cases over the memory layers (`application/tests/chat/*.use-case.test.ts`):
  a send writes the user message, binds, writes the queued assistant message, puts two jobs in
  `sent` when the chat opens and one otherwise, and leaves the chat's `updatedAt` at
  `sendable.at`; a bind refusal leaves `sent` empty; a delete removes the chat and its
  attachments' bytes. The transaction's atomicity stays with the journey (S21).
- **Verify:** with Docker stopped, `make test-unit` runs the two suites; `grep -rn
  "withTransaction" application/` is empty; `make check`.
- **Model:** fable high
- **Status:** todo

#### S13 — The `Assistant` port's adapter; `buildChatTitle` in the domain

- **Goal:** `AssistantLlm` holds the prompts and maps `AiError` to a defect; the title cut and the
  blank refusal are a pure domain operation with a unit test; `chat.llm.ts` is gone (R8, R1,
  D3).
- **Blocked by:** S11. *Parallel* with S12 (both add a line to `apps/worker/layer.ts`).
- **Files:** `infrastructure/chat/assistant.llm.ts` (`AssistantLlm`: `streamText(history)` over
  `buildChatPrompt`, `suggestTitle(text)` none for blank text without a model call, else the
  model's answer through `buildChatTitle`); `infrastructure/chat/chat.llm.ts` *gone*;
  `infrastructure/chat/index.ts`; `domain/chat/chat.model.ts` (`buildChatTitle(text):
  Option<ChatTitle>`, the grapheme cut and the blank refusal); `domain/testing/assistant.fake.ts`
  (`recordAssistant(script)` → `{ calls, layer }`; `holdAssistantCall()`) and
  `domain/testing/index.ts`; `application/chat/assistant-message.job.ts`, `chat-title.job.ts`
  (call the `Assistant` port); `apps/worker/layer.ts` (`AssistantLlm` over `LanguageModelStub`);
  `application/e2e/chat/*.job.e2e.ts` (`AssistantLlm` over `recordLanguageModel`);
  `domain/tests/chat/chat.model.test.ts`; `.claude/rules/naming.md` (the `.llm` half of the
  adapter row: an adapter of the `Assistant` port); `feature.md › Acceptance R8` (the prompt is
  "Write a title", not "Suggest a title").
- **Test first:** `buildChatTitle` (`domain/tests/chat/chat.model.test.ts`): a 300-grapheme text
  with an emoji at the cut is cut to `maxTitleLength` on a grapheme; blank text is none.
- **Verify:** `ls infrastructure/chat/chat.llm.ts` fails; `grep -rln "Write a title"
  --include=*.ts .` lists only `assistant.llm.ts`; `make check`.
- **Model:** fable high
- **Status:** todo

#### S14 — `GenerateChatTitleUseCase` and the worker's title handler

- **Goal:** the title flow is a use case; its handler lives in `apps/worker`; the send enqueues
  through `QueueClient.send`; `chat-title.job.ts` is gone (R3, R6, R7).
- **Blocked by:** S12, S13.
- **Files:** `application/chat/generate-chat-title.use-case.ts` (`generate(job)`:
  `messages.selectOne({ id: job.messageId })`, `assistant.suggestTitle`, `chatService.updateTitle`
  with today's three skip logs; key `@app-template/application/chat/GenerateChatTitleUseCase`);
  `application/chat/chat-title.job.ts` *gone*; `application/chat/send-message.use-case.ts`
  (`queue.send(chatTitleQueue, new GenerateChatTitle({ chatId, messageId }))` when
  `opensChat`); `application/chat/index.ts`; `apps/worker/chat/chat-title.handler.ts`
  (`handle`, `handleDeadLettered` exported; `ChatTitleHandler = Layer.mergeAll(worker(chatTitleQueue,
  handle), worker(chatTitleDeadLetterQueue, handleDeadLettered))` over the use case's layer);
  `apps/worker/layer.ts`; `apps/worker/package.json` (`@app-template/domain`, `@app-template/queue`;
  `devDependencies` `@effect/vitest`, `@app-template/testing`), `apps/worker/tsconfig.json`;
  `git mv application/e2e/chat/chat-title.job.e2e.ts
  application/tests/chat/generate-chat-title.use-case.test.ts` over the memory layers and
  `recordAssistant`; `apps/worker/tests/chat/chat-title.handler.test.ts`;
  `.claude/rules/naming.md` (the `.handler` row: `<object>.handler.ts` in the worker, one per
  queue; the `.job` row gone).
- **Test first:** the use case over the memory layers: an untitled chat gets the title; a titled
  one logs "chat title skipped: already titled"; a missing message logs "chat deleted"; an
  assistant answering none logs "nothing to title". The handler: `handleDeadLettered` logs an
  error; `handle` runs the use case.
- **Verify:** `find . -name "chat-title.job.ts" -not -path "*/node_modules/*"` is empty;
  `make test-unit`; `make check`.
- **Model:** fable high
- **Status:** todo

#### S15 — `GenerateAssistantMessageUseCase`: the reply over `MessageService`

- **Goal:** the reply is a use case that writes every stage through `MessageService`, reads the
  history and snapshots as one pipeline each, settles the chat's `updatedAt` itself, and
  exposes `fail` for the handler; `settleReply` is gone (R3, R5, R7, R12, D1, D3, D4).
- **Blocked by:** S14.
- **Files:** `application/chat/generate-assistant-message.use-case.ts` (`generate(job)`: the
  message by `messages.selectOne({ id: job.messageId, chatId: job.chatId })`, `prepare`, the
  history over `messages.selectByChat` and `store.select` as one pipeline, `generate`,
  `assistant.streamText(history)` with `snapshot` every 300 ms as one pipeline, `complete`,
  then `chats.update({ updatedAt }, { id })` ignoring a chat gone meanwhile; a
  `MessageMovedError` logs "assistant reply skipped: already settled"; `fail(messageId,
  cause)` fails the message while active; key
  `@app-template/application/chat/GenerateAssistantMessageUseCase`);
  `application/chat/assistant-message.job.ts` (shrinks to `handle`/`handleDeadLettered` over the
  use case; `enqueue` gone; the file goes in S16); `application/chat/send-message.use-case.ts`
  (`queue.send(assistantMessageQueue, …)`); `domain/chat/chat.service.ts` (`settleReply` gone)
  and `domain/tests/chat/chat.service.test.ts`; `application/chat/index.ts`; `git mv
  application/e2e/chat/assistant-message.job.e2e.ts
  application/tests/chat/generate-assistant-message.use-case.test.ts` over the memory layers,
  `recordAssistant` and `holdAssistantCall` (a race is arranged by writing `MessageRows` between
  hold and release); `application/testing/language-model.fake.ts` *gone*.
- **Test first:** the use case over the memory layers: the stages `preparing`, `generating`, a
  snapshot, `completed`, and the chat's `updatedAt` at the completion; a message moved during
  the hold is skipped; a deleted chat is skipped; `fail` writes `failed` with the reason and
  keeps `cause` out of the user's message; the history carries the attachments' bytes.
- **Verify:** `grep -rn "messages\.\(update\|insert\)" application/ apps/` is empty;
  `grep -rn "settleReply" --include=*.ts .` is empty; `make test-unit`; `make check`.
- **Model:** fable high
- **Status:** todo

#### S16 — The worker's assistant-message handler; no `.job` file remains

- **Goal:** the last-attempt policy and the dead-letter path live in
  `apps/worker/chat/assistant-message.handler.ts`, with a unit suite (R6, D4).
- **Blocked by:** S15.
- **Files:** `apps/worker/chat/assistant-message.handler.ts` (`handle(job, info)`: the use case,
  and on the last attempt `Effect.onExit` → `useCase.fail(job.messageId, exit.cause)`;
  `handleDeadLettered`: the "dead-lettered after N attempts" cause, the error log;
  `AssistantMessageHandler` layer); `application/chat/assistant-message.job.ts` *gone*;
  `application/chat/index.ts`; `apps/worker/layer.ts` (`WorkerLayer` over the two handler
  layers); `apps/worker/tests/chat/assistant-message.handler.test.ts`.
- **Test first:** `handle(job, info)` over the memory layers and a failing `recordAssistant`:
  the last attempt fails the message, an earlier one leaves it active; `handleDeadLettered`
  fails an active message with the attempts in its cause and logs an error, and skips a
  settled one.
- **Verify:** `find . -name "*.job.ts" -not -path "*/node_modules/*"` is empty;
  `ls apps/worker/chat/` shows the two handlers; `make check`; with the stand up,
  `make dev-worker` starts.
- **Model:** fable high
- **Status:** todo

#### S17 — The api's suites as unit tests over the memory layers

- **Goal:** `ApiTest` needs no database; the four handler suites run under `make test-unit`
  (R17, R4).
- **Blocked by:** S16.
- **Files:** `apps/api/testing/api.harness.ts` (`ApiServerTest`: `ApiHttp` over
  `RepositoryStackMemory`, `AttachmentBucketMemory`, `TransactionMemory`, `QueueClient.layer` over
  `recordQueue()`, `BunCrypto.layer`, `BunHttpServer.layerTest`); `git mv
  apps/api/e2e/<entity>/<entity>.handler.e2e.ts apps/api/tests/<entity>/<entity>.handler.test.ts`
  for `attachment`, `chat`, `health`, `user` (what they arranged through `Db` they arrange
  through the memory ports); `apps/api/package.json` (drop what is no longer imported);
  `application/testing/index.ts` (what the api suites still compose from it, else gone).
- **Test first:** the moved suites under `make test-unit` with Docker stopped: red while the
  harness still provides `DbTest`.
- **Verify:** with Docker stopped, `make test-unit` passes; `ls apps/api/e2e` fails;
  `find . -name "*.e2e.ts" -path "*/apps/*"` is empty; `make check`.
- **Model:** fable high
- **Status:** todo

### Storage and the e2e run

#### S18 — The e2e run's own MiniStack: `AwsTest`, a stage per test, the bucket provisioned

- **Goal:** the `e2e` project starts a MiniStack beside its Postgres and hands its endpoint
  through `inject`; each test gets a stage whose bucket and queues it provisions; the queue
  suite and the relay run on it (R18, D8).
- **Blocked by:** S5. *Parallel* with S7–S17 (its one shared file is
  `infrastructure/testing/index.ts`, a line each).
- **Files:** `infrastructure/testing/e2e.setup.ts` (starts both containers with `Promise.all`,
  `provide('awsEndpoint')`; `infrastructure/package.json` gains `testcontainers` in
  `devDependencies`); `packages/testing/aws.ts` (`SqsClientTest`, `S3ClientTest` over
  `inject('awsEndpoint')`, the region and credentials; `ProvidedContext` gains `awsEndpoint`);
  `packages/testing/ministack.ts` *gone*; `packages/testing/index.ts`, `packages/testing/package.json`
  (`@effect-aws/client-s3`); `packages/aws/provision.ts` (`provision(resources, stage)` creates
  the bucket too, idempotent; `packages/aws/package.json` gains `@effect-aws/client-s3`);
  `infrastructure/testing/aws.harness.ts` (`AwsTest`: a stage `e2e<8 hex>`, `provision`,
  `AwsConfig` over the endpoint); `infrastructure/testing/index.ts`;
  `packages/queue/e2e/queue.e2e.ts` (on `SqsClientTest`, a stage of its own per `layer` block
  instead of `'test'`); `infrastructure/e2e/outbox/outbox.relay.e2e.ts` (one case on
  `QueueTransport.layerSqs` over `AwsTest`: the row reaches the stage's real queue; the
  recording transport keeps the failure cases); `docs/knowledge/aws.md › Tests on Docker`,
  `docs/knowledge/tooling.md › Tests`.
- **Test first:** `OutboxRelay` on `DbTest` and `AwsTest`
  (`infrastructure/e2e/outbox/outbox.relay.e2e.ts`): a job written to the outbox is received
  from the stage's real SQS queue. Red: no `AwsTest`, no bucket in `provision`.
- **Verify:** with the local stand down, `make test-e2e` passes; two `make test-e2e` runs at once
  from two shells both pass; `grep -rn "SqsClientMiniStack" --include=*.ts .` is empty;
  `make check`.
- **Model:** fable high
- **Status:** todo

#### S19 — `packages/s3`: `S3Bucket`

- **Goal:** a generic file service over `S3Service`, bound to one bucket per layer: `put` as one
  `PutObject` or a multipart upload cut with `Stream.transduce(Sink.fold(…))`,
  `Stream.zipWithNext` and `Bytes.concat`, aborted under `Effect.acquireRelease` as one pipeline;
  `get`, `exists`, `url`, `untag`, `delete` (R15, R12, D9).
- **Blocked by:** S18.
- **Files:** `packages/s3/package.json` (`@app-template/s3`; `effect`, `@effect-aws/client-s3`;
  `devDependencies` `@app-template/testing`, `@effect/vitest`), `packages/s3/tsconfig.json`,
  `packages/s3/index.ts`, `packages/s3/bucket.ts` (`S3Bucket`, `S3Bucket.layer({ bucket, partSize? })`,
  key `@app-template/s3/S3Bucket`; `architecture.md › Structure` is named for the entity, bucket: the bare
  name follows `packages/queue/queue.ts`, since `.file` is no role); `packages/s3/package.json`
  also declares `imports` `#s3/*`; root `tsconfig.json` (the reference);
  `packages/s3/e2e/bucket.e2e.ts` over `S3ClientTest` and a bucket `e2e<8 hex>` the suite creates
  itself (no inventory, so the package stays generic).
- **Test first:** `S3Bucket` on `S3ClientTest` (`packages/s3/e2e/bucket.e2e.ts`): 0 bytes, exactly
  5 MiB and 5 MiB + 1 upload as one `PutObject`, one `PutObject` and two parts (read as
  `getObjectAttributes`'s `ObjectParts.TotalPartsCount`, which MiniStack answers; the ETag's
  `-<parts>` suffix sits inside the quotes it returns); a
  12 MiB stream uploads as three parts and `get` reads 12 MiB; a stream that fails after 6 MiB
  leaves `exists` false and `listMultipartUploads` empty; `url`, `exists`, `untag` and `delete`
  on a missing key answer none, false, void, void.
- **Verify:** `make test-e2e`; `make check`.
- **Model:** fable high
- **Status:** todo

#### S20 — `AttachmentBucketS3` over `S3Bucket`

- **Goal:** the bucket adapter holds only the keys, the headers, the tag and the domain mapping,
  under 80 lines, and gets its first real test (R15, R18, D9).
- **Blocked by:** S19.
- **Files:** `infrastructure/attachment/attachment.bucket.ts`; `infrastructure/shared/aws.client.ts`
  (`S3BucketFromConfig`: `S3Bucket.layer({ bucket: buildResourceName(stage,
  resources.buckets.attachments.name) })` over `S3ServiceFromConfig` and `AwsConfig`);
  `infrastructure/attachment/index.ts` (`AttachmentPgS3` over `S3BucketFromConfig`);
  `infrastructure/package.json` (`@app-template/s3`), `infrastructure/tsconfig.json`;
  `infrastructure/e2e/attachment/attachment.bucket.e2e.ts` over `AwsTest` and
  `S3BucketFromConfig`; `docs/knowledge/aws.md › Attachments` (the tag on a multipart upload is
  untestable on MiniStack, which drops `Tagging` on `CreateMultipartUpload`).
- **Test first:** `AttachmentBucketS3` on `AwsTest`: the key `attachments/<id>`; the content type
  and an inline disposition that survives a UTF-8 file name; the `unbound` tag on a small
  upload; `keep` clears it; `url` is presigned on the endpoint's host; `select` of a missing
  id is none.
- **Verify:** `wc -l infrastructure/attachment/attachment.bucket.ts` under 80; `make test-e2e`;
  `make check`.
- **Model:** fable high
- **Status:** todo

#### S21 — The journey: a root `e2e/` workspace over both app layers

- **Goal:** one test drives HTTP → outbox → relay → SQS → worker → HTTP in one process over the
  run's containers and the model stub; the apps export `./layer`; the send's outbox write is
  proved transactional there (R18, R7, D7).
- **Blocked by:** S16, S17, S20.
- **Files:** `e2e/package.json` (`@app-template/e2e`, `devDependencies` only: `@app-template/api`,
  `worker`, `http-api`, `infrastructure`, `domain`, `testing`, `config`, `llm`, `effect`,
  `@effect/vitest`, `@effect/platform-bun`; `imports` `#e2e/*`), `e2e/tsconfig.json`; root
  `package.json` (`workspaces` gains `e2e`), root `tsconfig.json` (the reference);
  `apps/api/package.json`, `apps/worker/package.json` (`exports["./layer"]`);
  `e2e/testing/stand.harness.ts` (`StandTest`: `ApiHttp` over `BunHttpServer.layerTest` and the
  api's config-fed adapters, merged with `WorkerLayer`, under one `ConfigProvider.fromUnknown`
  of `DATABASE_URL` and `AWS_ENDPOINT_URL` from `inject`, `STAGE` from the test, and
  `AWS_REGION`, `API_PORT`, `NODE_ENV`, `LOG_LEVEL`, `QUEUE_LOCK_EXPIRATION`,
  `QUEUE_LOCK_REFRESH_INTERVAL`, `OUTBOX_POLL_INTERVAL` fixed; `ApiClient.layer` on the
  `address` of the `HttpServer` service); `e2e/chat.e2e.ts` (a user, a chat, an upload, a
  send, the message polled to `completed` with `Effect.repeat` on `Schedule.spaced(100 ms)`
  under a 15 s `Effect.timeout`, the title read back, a send with a stale attachment id leaves
  the outbox empty, the delete removes the objects); `.claude/rules/naming.md › Workspaces`
  (the `e2e` workspace; the apps' `./layer` export); root `CLAUDE.md › Map` (an `e2e` row);
  `docs/knowledge/tooling.md › Tests`, `docs/knowledge/architecture.md` (the `e2e` workspace in
  the dependency table). CI stays: its test job runs `bun run test`, both projects.
- **Test first:** the journey over `StandTest` (`e2e/chat.e2e.ts`).
- **Verify:** `make test-e2e`; `find . -name "*.e2e.ts" -not -path "*/node_modules/*"` lists
  nothing under `apps/`; `make check`.
- **Model:** fable high
- **Status:** todo

#### S22 — The bundle guard

- **Goal:** `make check` builds the web bundle and fails on a service, port or adapter key in it
  (R23, D12).
- **Blocked by:** S3. *Parallel* with everything after S3.
- **Files:** `Makefile` (`bundle-check`: `bun build apps/web/app/main.ts --outdir
  node_modules/.cache/web-bundle --target browser`, then the negated grep of
  `architecture.md › Tests`; `check` runs it; `.PHONY`); `domain/package.json` (`"sideEffects":
  false` confirmed); `docs/knowledge/architecture.md › Three boundary guards` (a fourth).
- **Test first:** `config only`; the probe: a value import of `ChatService` in
  `http-api/chat/chat.http.ts` (the web override already bans `@app-template/domain` in
  `apps/web`, so the leak the guard catches comes through `http-api`) turns `make bundle-check`
  red; removed before the report.
- **Verify:** `make bundle-check` green; the probe red; `make check`.
- **Model:** opus medium
- **Status:** todo

### Language and rules

#### S23 — The rules and the layer `CLAUDE.md` files on the new model

- **Goal:** the rules speak the glossary's words and describe only the new model (R20, R21).
- **Blocked by:** S21, S22.
- **Files:** `git mv .claude/rules/use-cases.md .claude/rules/layering.md` (paths `domain/**`,
  `application/**`, `apps/**`; ports, domain services, use cases, handlers, the rule-free write,
  `Transaction.run`, the enqueue inside it, the concurrency section kept); `.claude/rules/naming.md`
  (whole: `.port`, `.model` with the rules, `.service` domain only with D14's two naming forms,
  `.use-case`, `.handler` in
  api and worker, the adapters `.repository` · `.bucket` · `.llm`, `tests/` and `e2e/` with
  `.test`/`.e2e` and the mirror rule, the three `./testing` exports, `.job` gone);
  `.claude/rules/effect-tests.md` (unit over memory layers, e2e over the run's containers, the
  harnesses `DbTest`, `AwsTest`, `StandTest`); `.claude/rules/effect-services.md` (the domain
  service's shape; `Transaction.run` as the pipeable); `.claude/rules/tooling.md` (the three test
  targets); `domain/CLAUDE.md`, `application/CLAUDE.md`, `infrastructure/CLAUDE.md`,
  `apps/CLAUDE.md`, `packages/CLAUDE.md` (`s3`); `docs/knowledge/glossary.md` (the **E2E test**
  entry names an adapter or the journey, not a use case or a handler; the **Port** and
  **Adapter** entries say bucket, with store in the `_Avoid_` list; the **Domain service** entry
  carries D14's naming; the fifteen terms of R20 checked against the rules' words).
- **Test first:** `config only`.
- **Verify:** `grep -rn "application.*service\|\.job\b\|chat.llm\|AttachmentStore" .claude/rules/
  */CLAUDE.md` finds nothing; `grep -rn "interactor\|orchestrator\|controller" .claude/rules/`
  is empty; `sed -n '/^## Architecture language/,$p' docs/knowledge/glossary.md | grep -c
  '^\*\*'` prints 15; `make check`.
- **Model:** fable high
- **Status:** todo

#### S24 — The knowledge docs on the new model

- **Goal:** `architecture.md` and `tooling.md` describe the layering, the test layout and the
  workspaces as they now are, and every rule or `CLAUDE.md` line that restates them is trimmed
  (R21).
- **Blocked by:** S23.
- **Files:** `docs/knowledge/architecture.md` (the diagram with `e2e` and `packages/s3`; the
  layer table; the dependency table with `e2e`; "Where things live" on the nine chat files, the
  ports, the services, the use cases, the handlers, `testing/`, `tests/`, `e2e/`; "Add a new
  entity"; the guards); `docs/knowledge/tooling.md › Tests` (unit and e2e, the projects, the
  containers per run, a stage per test, the journey, two worktrees at once);
  `docs/knowledge/database.md › Tests`, `docs/knowledge/aws.md › Tests on Docker` (the final
  wording); the rules and `CLAUDE.md` lines these pages now state (trimmed in this step).
- **Test first:** `config only`.
- **Verify:** `grep -rn "application.*service\|\.job\b\|chat.llm\|colocated\|apps/[a-z]*/src"
  docs/knowledge/` finds only the glossary's `_Avoid_` lines and the roadmap's history;
  `make ids`; `make check`.
- **Model:** opus medium
- **Status:** todo

## Requirement coverage

| Req | Steps |
|---|---|
| R1 | S6, S13 |
| R2 | S8, S9, S10, S11 |
| R3 | S12, S14, S15 |
| R4 | S10, S17 |
| R5 | S11, S15 |
| R6 | S14, S16 |
| R7 | S14, S15, S21 |
| R8 | S13 |
| R9 | S5 |
| R10 | S6, S11 |
| R11 | S9, S10 |
| R12 | S5, S5b, S9, S15, S19 |
| R13 | S4 |
| R14 | S1 |
| R15 | S19, S20 |
| R16 | S5 |
| R17 | S2, S7, S7b, S7c, S8, S9, S10, S11, S12, S14, S15, S16, S17 |
| R18 | S2, S18, S19, S20, S21 |
| R19 | S2 |
| R20 | S23 |
| R21 | S7b, S23, S24 |
| R22 | S3 |
| R23 | S22 |

Memory rules and their e2e twins (D6): the second active message (`MessageRepositoryMemory.insert`
↔ `message.repository.e2e.ts`), the stage condition of `update` (↔ the same), the owner mismatch
as none (`ChatRepositoryMemory.selectOne` ↔ `chat.repository.e2e.ts`, `AttachmentRepositoryMemory`
↔ `attachment.repository.e2e.ts`), the bound attachment refusing the cascade
(`ChatRepositoryMemory.delete` ↔ `chat.repository.e2e.ts`).
