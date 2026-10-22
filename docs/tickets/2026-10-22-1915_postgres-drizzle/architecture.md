# Postgres and Drizzle — architecture

> Ticket: `2026-10-22-1915_postgres-drizzle` · Requirements: [feature.md](./feature.md)

## Overview

Four ports change adapters, one port gains a second implementation, and the local stand gains a
database:

- **The repositories move to Postgres** through Drizzle's Effect integration over
  `@effect/sql-pg`. Each aggregate declares its tables once, in `<entity>.entity.ts`, with the
  constraints that hold its invariants; the row codecs are derived from the tables by
  `drizzle-orm/effect-schema` and refined with the domain's own schemas, so no mapping function
  is written by hand. Reads that span aggregates run as one relational query behind a read
  method of the port (D1, D2, D6, D9).
- **A send is one transaction.** `SqlClient.withTransaction` wraps the use case; the
  repositories join it through the Effect context. Jobs are written to an `outbox` table by a
  second `QueueClient`, `QueueClientOutbox`, and a relay in the worker publishes them to SQS
  (D3, D4).
- **The database guards replace `UserLock`.** A partial unique index allows one active
  assistant message per chat; conditional single-statement writes (`ON CONFLICT DO NOTHING`,
  `WHERE message_id IS NULL`, `WHERE stage = $from`, `WHERE title IS NULL`) return whether they
  applied, and the application raises the domain error (D5).
- **Stuck replies** are settled by a consumer of the assistant message's dead-letter queue (D8).
- **Locally the database is an RDS instance on MiniStack**, created by `@pulumi/aws` from a
  `local` stack of `deployment/aws`; **tests** share one Postgres container per run and take a
  database each from a migrated template (D10, D11).
- **Drizzle's source is vendored** in `repos/drizzle`, as Effect's is (D14).

```mermaid
graph LR
  subgraph apps
    api["apps/api"]
    worker["apps/worker"]
  end
  api --> SM["SendMessageUseCase<br/>sql.withTransaction"]
  SM --> CS["ChatService"] & AS["AttachmentService"] & J["jobs .enqueue"]
  CS --> CR["ChatRepository · MessageRepository"]
  AS --> AR["AttachmentRepository"]
  J --> QCo["QueueClientOutbox"]
  CR & AR --> Db["Db (Drizzle)"]
  QCo --> Db
  Db --> Pg["PgClient (@effect/sql-pg)"] --> DB[("Postgres")]
  worker --> relay["OutboxRelay"] --> Db
  relay --> T["QueueTransport.layerSqs"] --> SQS[("SQS queues + DLQs")]
  worker --> W["job workers · dead-letter workers"] --> QCs["QueueClientSqs"] --> SQS
  W --> CR
  mk["make up"] --> local["deployment/local<br/>MiniStack + docker.sock"]
  mk --> aws["deployment/aws · stack local<br/>rds.Instance"] --> MS[("MiniStack RDS")]
  DB --- MS
  mk --> mig["make migrate"] --> DB
```

## Structure

**Catalogs and vendoring** (`package.json`, `Makefile`)

```
+ catalogs.drizzle     drizzle-orm 1.0.0-rc.5, drizzle-kit 1.0.0-rc.5 (one release train)   (D14, D16)
~ catalogs.effect      + @effect/sql-pg 4.0.5
~ catalogs.runtime     + @testcontainers/postgresql 12.2.1
~ catalogs.pulumi      + @pulumi/aws 7.51.1
+ repos/drizzle        git subtree of drizzle-team/drizzle-orm at v<catalogs.drizzle.drizzle-orm>  (D14)
+ make vendor-drizzle  the subtree pull (add on the first run), beside vendor-effect
+ make migrate         bun --env-file=.env infrastructure/db/migrate.ts                        (D13)
+ make migration       NAME=<name>: bunx drizzle-kit generate --config infrastructure/drizzle.config.ts --name $(NAME)
+ make migration-check generate into the committed folder and fail if a new folder appeared  (D13)
~ make up · down · reset   the two Pulumi projects, the port check, migrate                   (D11)
~ make check           + migration-check
- STORE_PATH, .data/store    from .env.example, tooling.md, the Makefile comment on reset
+ DATABASE_URL, OUTBOX_POLL_INTERVAL   in .env.example
~ vitest.config.ts     globalSetup: infrastructure/db/testing/postgres.setup.ts               (D10)
```

**`domain`**

```
~ domain/chat/chat.model.ts     + MessageDetail, ChatSummary, ChatDetail (moved from application) (D6)
~ domain/chat/chat.service.ts   ChatRepository, MessageRepository: Contracts › Ports             (D5, D6)
~ domain/attachment/attachment.service.ts   AttachmentRepository.bind replaces update          (D5)
~ domain/chat/chat.service.ts   SendableChat doc: holds inside the send's transaction, the index is the backstop
```

**`infrastructure`**

```
+ infrastructure/db/db.client.ts        Db (Context.Service over EffectPgDatabase), Db.layer (needs PgClient;
                                        provides the Debug EffectLogger and EffectCache.Default),
                                        Db.layerFromConfig over PgClientFromConfig (DatabaseConfig → PgClient.layer);
                                        layerFromConfig also publishes PgClient, so SqlClient.withTransaction
                                        runs on Db's connection, see D3                                    (D1, D3, D12)
+ infrastructure/db/columns.ts          shared column sets: id (uuid pk DEFAULT uuidv7()), timestamps        (D9)
+ infrastructure/db/relations.ts        defineRelations over every .entity.ts table                          (D6)
+ infrastructure/db/migrate.ts          the migrate program: DatabaseConfig → PgClient → migrate(db, …)     (D13)
+ infrastructure/db/migrations/         drizzle-kit output, committed
+ infrastructure/db/testing/postgres.setup.ts   vitest globalSetup: container, template, provide           (D10)
+ infrastructure/drizzle.config.ts      dialect, schema glob ./*/*.entity.ts, out ./db/migrations; no credentials
+ infrastructure/user/user.entity.ts    users, credentials; UserRow, UserInsert, CredentialInsert codecs    (D2)
+ infrastructure/chat/chat.entity.ts    chats, the title check, its index; ChatRow, ChatInsert
+ infrastructure/chat/message.entity.ts messages, the enums, the partial unique index, checks; MessageRow, MessageInsert
                                        (one entity file per entity, as the folder's repositories are split)
+ infrastructure/attachment/attachment.entity.ts   attachments; codecs
+ infrastructure/outbox/outbox.entity.ts   outbox
+ infrastructure/outbox/outbox.relay.ts    OutboxRelay, a worker layer                                      (D4)
~ infrastructure/user/user.repository.ts        UserRepositoryPg
~ infrastructure/chat/chat.repository.ts        ChatRepositoryPg (relational reads, touch, updateTitle)
~ infrastructure/chat/message.repository.ts     MessageRepositoryPg (insert → boolean, update from)
~ infrastructure/attachment/attachment.repository.ts   AttachmentRepositoryPg (bind)
~ infrastructure/*/index.ts             UserPg, ChatPg, AttachmentPg, AttachmentPgS3 (replacing *Kv)
~ infrastructure/shared/queue.client.ts   + QueueClientOutbox                                               (D4)
~ infrastructure/chat/chat.queue.ts     + assistantMessageDeadLetterQueue, chatTitleDeadLetterQueue         (D8)
~ infrastructure/package.json           + drizzle-orm, @effect/sql-pg; devDependencies + drizzle-kit, @testcontainers/postgresql
- infrastructure/kv/                    kv-collection, kv-store and their tests
```

**`application`**

```
~ application/chat/chat.service.ts              no UserLock; list → selectSummaries, get → selectDetail,
                                                 rename → update, delete → chats.delete, touch → chats.touch,
                                                 addAssistantMessage: insert false → ChatBusyError          (D5, D6)
~ application/chat/send-message.use-case.ts     Effect.fn(…, sql.withTransaction); bind(userId, ids, messageId) (D3)
~ application/chat/delete-chat.use-case.ts      no lock; attachments, then the chat (the cascade does the messages)
~ application/attachment/attachment.service.ts  bind replaces findBindable + bind; BindableAttachments goes (D5)
~ application/chat/assistant-message.job.ts     update(message, { from }); + deadLetterWorker (failReply)   (D8)
~ application/chat/chat-title.job.ts            updateTitle(id, title); + deadLetterWorker (log)
- application/chat/touch-chat.ts                replaced by ChatRepository.touch
- application/user/user-lock.ts
~ application/testing/chat.harness.ts           services on ChatPg · AttachmentPg · QueueClientOutbox over PgClientTest;
                                                 reads the outbox table in place of recordQueue
~ application/testing/chat.fake.ts              interleaveMessages and AttachmentRepositoryYielding go (real concurrency now);
                                                 keeps one MessageRepository wrapper that fails the assistant insert (the rollback case)
```

**`packages`**

```
~ packages/config/config.ts     + DatabaseConfig { url: Redacted } from DATABASE_URL;
                                QueueConfig + outboxPollInterval (OUTBOX_POLL_INTERVAL, default 1 s);
                                - StoreConfig                                                               (D15)
+ packages/config/postgres.ts   postgresImage: postgres:18.6-alpine by digest (tests; the fallback container)
+ packages/testing/postgres.ts  setupTemplateDatabase (the setup's half); PgClientTest: a fresh database
                               per test from the template, PgClient on it                                (D10)
~ packages/testing/package.json  + @effect/sql-pg
```

**`apps`**

```
~ apps/api/src/layer.ts         UserPg, ChatPg, AttachmentPgS3; QueueClientOutbox; Db.layerFromConfig
~ apps/worker/src/layer.ts      ChatPg, AttachmentPgS3; QueueClientSqs; OutboxRelay; the four workers; Db.layerFromConfig
~ apps/api/src/testing/api.harness.ts   ApiHttp over PgClientTest and QueueClientOutbox
```

**`deployment`**

```
~ deployment/local/ministack.ts   + /var/run/docker.sock mount, MINISTACK_RDS_PUBLIC_ENDPOINT=1, RDS_PERSIST=1,
                                  RDS_BASE_PORT=<port of DATABASE_URL>; docker.RemoteImage postgres:18-alpine  (D11)
+ deployment/aws/Pulumi.yaml      runtime: bun, main: index.ts (replaces the nodejs stub project file)
~ deployment/aws/index.ts         the program: provider + database
+ deployment/aws/provider.ts      aws.Provider from AwsConfig: endpoint set → endpoints: [{ rds, s3, sqs }] and the
                                  three skip flags; unset → defaults (ticket 9)
~ deployment/aws/database.ts      aws.rds.Instance: identifier from buildResource('database'), postgres 18,
                                  db.t4g.micro, allocatedStorage = maxAllocatedStorage = 20, credentials and
                                  dbName from DATABASE_URL, skipFinalSnapshot, publiclyAccessible; exports endpoint
+ deployment/local/check-database.ts   fails unless a container labelled ministack=rds publishes DATABASE_URL's port
~ deployment/package.json         + @pulumi/aws
```

**Docs and rules**

```
+ docs/knowledge/database.md     schema and entity files, codecs, the transaction and the outbox, the guards,
                                 migrations, the local RDS and the fallback, tests, Debug logging
~ docs/knowledge/architecture.md  table row for infrastructure/db, "Where things live" (+ .entity, + .relay),
                                 "Add a new entity" step 5 on Postgres, Seams; links database.md
~ docs/knowledge/aws.md          RDS on MiniStack: the socket, RDS_BASE_PORT, RDS_PERSIST, the volume on reset
~ docs/knowledge/tooling.md      targets, catalogs, worktree ports (+ DATABASE_URL port), vendor-drizzle, tests
~ .claude/rules/naming.md        .entity, .relay roles; <Entity>Pg bundles; the harness line (no memory store)
~ .claude/rules/effect.md        Drizzle APIs checked against repos/drizzle/drizzle-orm/src
~ .claude/rules/use-cases.md     Concurrency: the transaction and the database guards replace the lock lines
~ infrastructure/CLAUDE.md       the KV placeholder line → Db and .entity
```

## Contracts

### Tables (`snake_case` in the database, declared with `snakeCase.table`)

```
users        id uuid pk default uuidv7() · created_at timestamptz
credentials  hash text pk check (64 hex) · kind credential_kind ('secret') · user_id → users on delete cascade
chats        id · user_id → users · title text null check (trimmed, 1..maxTitleLength) · created_at · updated_at
             index (user_id, updated_at desc)
messages     id · chat_id → chats on delete cascade · author message_author · stage message_stage ·
             text text · attachment_ids uuid[] · error jsonb null · created_at · updated_at
             index (chat_id, created_at)
             unique index messages_one_active_per_chat (chat_id)
               where author = 'assistant' and stage in ('queued', 'preparing', 'generating')
attachments  id · user_id → users · message_id uuid null → messages (restrict) · file_name text check (non-empty) ·
             media_type text · size integer check (>= 0) · created_at
             index (message_id)
outbox       id uuid pk default uuidv7() · queue text · job_id text · body text · created_at
             index (created_at)
```

Enums come from the domain literals (`pgEnum('message_stage', MessageStage.literals)`); the
checks read the same constants as the brands (`maxTitleLength`). `created_at` and `updated_at`
have no default: the domain writes them (D9).

### Codecs (per `.entity.ts`, from `drizzle-orm/effect-schema`)

```ts
export const ChatRow = createSelectSchema(chats, {
  id: ChatId,
  userId: UserId,
  title: Schema.OptionFromNullOr(ChatTitle),
  createdAt: Schema.DateTimeUtcFromDate,
  updatedAt: Schema.DateTimeUtcFromDate,
})
export const ChatInsert = createInsertSchema(chats, { /* the same overrides */ })
// read:  decode(row) → new Chat(fields)     write: encode(chat) → db.insert(chats).values(row)
```

`error` on `messages` is `Schema.OptionFromNullOr(MessageFailure)` (the derived `jsonb` schema
loses `$type`, so the override is what types it). Relational reads decode each nested row with
the same codecs.

### Ports (domain, `Context.Service`, no layer; changes only)

```ts
ChatRepository {
  insert(chat): void
  update(chat): void                                   // rename: title and updatedAt
  touch(id, at): void                                  // updated_at only
  updateTitle(id, title): boolean                      // writes only while untitled; false: titled meanwhile
  selectById(id): Option<Chat>
  selectSummaries(userId): ReadonlyArray<ChatSummary>   // most recently updated first, with the active message
  selectDetail(id): Option<ChatDetail>                  // messages in creation order, each with its attachments
  delete(id): void                                      // the messages go by the cascade
}
MessageRepository {
  insert(message): boolean      // false: the chat already has an active message (the partial index)
  update(message, { from: MessageStage }): boolean   // false: the stored stage is not `from`
  selectById(id): Option<Message>
  selectByChat(chatId): ReadonlyArray<Message>       // the job's history
  selectActiveByChat(chatId): Option<ActiveMessage>
}
AttachmentRepository {
  insert · selectById · selectByIds · deleteByIds      // unchanged
  bind(ids, messageId): ReadonlyArray<Attachment>      // the ones bound now: WHERE message_id IS NULL
}
UserRepository                                         // unchanged; insert writes two tables in one transaction
```

Ports keep no error channel: a conditional write answers with a value, and the application
raises `ChatBusyError`, `AttachmentBoundError` or skips (D5). `selectByUser`, `deleteByChat`,
`AttachmentRepository.update` and the read models in `application` go.

### The send (use case)

```ts
const send = Effect.fn('SendMessageUseCase.send')(function* (userId, chatId, input) {
  const sendable = yield* chatService.findSendable(userId, chatId, input)
  const userMessage = yield* chatService.addUserMessage(sendable)
  const bound = yield* attachmentService.bind(userId, input.attachmentIds, userMessage.id)
  const assistantMessage = yield* chatService.addAssistantMessage(sendable)   // insert false → ChatBusyError
  yield* chatService.touch(sendable)
  yield* assistantJob.enqueue(assistantMessage)                               // an outbox row
  if (sendable.opensChat) yield* titleJob.enqueue(userMessage)
  return …
}, sql.withTransaction)
```

`attachmentService.bind` selects the ids, checks each with `ensureBindable` (not found, foreign,
expired, bound), runs the conditional update and raises `AttachmentBoundError` for an id the
update skipped (a concurrent bind).

### Outbox and relay

- `QueueClientOutbox.send(definition, message)`: `encodeBody` as the SQS client does, then
  `insert into outbox (queue, job_id, body)`; it joins the caller's transaction. `consume` dies:
  the api never consumes.
- `OutboxRelay` (worker layer, `Effect.forkScoped` under `Layer.effectDiscard`): in a
  transaction, `select … order by created_at, id limit 10 for update skip locked`; for each row
  `QueueTransport.send(buildResourceName(stage, queue), { body, attributes: { jobId } })`, then
  `delete`; commit. An empty batch sleeps `outboxPollInterval`; a full one polls again at once.
  A failed send fails the transaction: the rows stay and the next poll retries; the loop
  restarts on any cause with the queue consumers' `consumerRestart` schedule.
- Delivery is at-least-once: a crash between the SQS send and the commit republishes; the
  handlers are idempotent (`aws-local` R9).

### Dead-letter consumers

```ts
assistantMessageDeadLetterQueue = { name: buildDeadLetterName(assistantMessage.name), schema: GenerateAssistantMessage,
  maxAttempts: Number.MAX_SAFE_INTEGER, retryDelay: capped doubling (max 5 min), jobId }
AssistantMessageJob.deadLetterWorker = worker(assistantMessageDeadLetterQueue, failDeadLettered)
  // failDeadLettered: selectById → if active: failMessage(ReplyFailed, cause 'dead-lettered after N attempts')
  //                   → update(failed, { from: active.stage }) → touch; else log 'already settled' / 'chat deleted'
ChatTitleJob.deadLetterWorker = worker(chatTitleDeadLetterQueue, log 'chat title dead-lettered')
```

A dead-letter queue has no redrive, so a handler failure must never spend a "last attempt":
`maxAttempts` is unreachable and the retry delay is capped.

### Configuration

| Service | Variable | Default |
|---|---|---|
| `DatabaseConfig.url` (`Redacted`) | `DATABASE_URL` | — (`postgres://app:app@localhost:15432/app_template` in `.env.example`) |
| `QueueConfig.outboxPollInterval` | `OUTBOX_POLL_INTERVAL` | `1 second` |

`PgClientFromConfig = Layer.unwrap(Effect.map(DatabaseConfig, ({ url }) => PgClient.layer({ url })))`.
The worktree table gains `DATABASE_URL`'s port, `15432 + 10N`.

### The local stand (D11)

| Target | Does |
|---|---|
| `make up` | `deployment/local` up (MiniStack with the socket and the RDS variables, `postgres:18-alpine` pulled first) → `deployment/aws` `local` up (the instance; ~80 s the first time, seconds after) → `check-database.ts` → `make migrate` → `provision.ts` |
| `make down` | `deployment/local` destroy only: MiniStack stops gracefully, saves its state, the instance's container goes with it and respawns on the next `up`; the `aws` stack keeps the instance |
| `make reset` | `deployment/aws` destroy → `deployment/local` destroy → `docker volume rm` of the volumes named `…-instance-<identifier>-data` (MiniStack names the container and the volume `ministack-rds-<hash of account and region>-instance-<identifier>[-data]`) → `rm -rf .data` |

The identifier is `app-template-<STAGE>-database` and the container lives on the host's Docker, so
each worktree sets its own `STAGE` (`local<N>`) beside its ports.

`PULUMI` in the Makefile becomes a function of the project directory; both projects log in to the
same file backend under `.data/pulumi`, so `make reset` drops both stacks' state.

### Tests (D10)

- `postgres.setup.ts` (`globalSetup`): `new PostgreSqlContainer(postgresImage).start()`, then
  `setupTemplateDatabase` from `@app-template/testing`, given the same program as `make migrate`:
  create the `template` database, migrate it and close the client, `ALTER DATABASE … is_template`,
  `provide('databaseUrl', <admin url>)`; the container stops on teardown and when the template
  fails. Every name of the protocol (the template, the key, the `test_` prefix) lives in
  `@app-template/testing`.
- `PgClientTest` (`@app-template/testing`): `inject('databaseUrl')`, `CREATE DATABASE test_<random>
  TEMPLATE template`, `PgClient.layer({ url })` for it; the scope's release drops the database
  `WITH (FORCE)`. Each test provides its stack over it (`Effect.provide`), about 40 ms for the
  create, the connection and the drop.
- `recordQueue` stays in `packages/queue/testing` for suites with no database; the harnesses read
  `outbox` rows instead.

## Seams

| Seam | Catches | Misses |
|---|---|---|
| 1 `domain/*` schemas and pure rules (unchanged) | input and binding rules, stage transitions, read-model shapes | persistence |
| 2 `infrastructure/db` on `PgClientTest`: `migrate`, `Db.layer`, the codecs of every `.entity.ts` | migrations apply to an empty database and are a no-op the second time; each test runs on a fresh database, so a table one test writes is absent from the next; a row encodes and decodes back to an equal model (`Option`, `DateTime.Utc`, brands, `jsonb` error, `uuid[]`); SQL logged at `Debug` with `query` and `params`, nothing at `Info` | drift between entities and the committed migrations (Seam 9) |
| 3 repositories through their ports on `PgClientTest` (one suite per port) | field mapping, `selectSummaries` order and active message, `selectDetail` nesting and order, `insert` false on an active message, `update` false on a stale `from`, `bind` partial result, `updateTitle` false when titled, `touch` keeps the title, the cascade from `chats.delete`, `RESTRICT` on a bound attachment, the check constraints reject what the brands reject | cross-process timing |
| 4 `QueueClientOutbox` and `OutboxRelay` on `PgClientTest` + MiniStack | a `send` inside a failed transaction leaves no row; a row is published to its queue with its `jobId` and deleted; two relays over one database publish each row once; a failing transport keeps the row; the poll interval under `TestClock` | SQS outages longer than a test |
| 5 services and use cases on `ChatPg`, `AttachmentPg`, `QueueClientOutbox`, `TestCrypto` | a send writes two messages, the binds, the touch and one or two outbox rows in one transaction, and nothing on a failing step; two concurrent sends to one chat → one `ChatBusyError`; two concurrent binds of one attachment → one `AttachmentBoundError`; rename beside a send keeps both; delete cascade and the attachments' removal; `addAssistantMessage` alone is refused on a busy chat | HTTP statuses |
| 6 jobs with the fake `LanguageModel` on Postgres under `TestClock` | the stage sequence through `update(…, { from })`; a message settled by another writer stops the job with `already settled`; the dead-letter handler fails an active message with `ReplyFailed` and a dead-letter cause, leaves a terminal one, logs for a deleted chat; the title dead-letter handler only logs; `updateTitle` skips a titled chat | a real provider |
| 7 `apps/api` through `BunHttpServer.layerTest` + `ApiClient` on `PgClientTest` | the wire unchanged (`/openapi.json` equal to `main`'s), `202` with outbox rows, `409` on a busy chat across two concurrent requests | the worker, the relay |
| 8 `apps/worker` layer build on `PgClientTest` + MiniStack (`layer.test.ts`) | the relay, the four workers and the Db compose and start | live SQS timing |
| 9 `make migration-check` | an entity change without a committed migration | a migration edited by hand |
| 10 by hand (acceptance R16–R18): `make up`, `down`, `reset`, worktree `N=1` | the RDS instance, the port, persistence, the volume, the fallback criteria | — |

## Decisions

- **D1 — Drizzle over `@effect/sql-pg`, reached only through Effect.** `PgDrizzle.make()` runs on
  the `PgClient` service; queries are Effects, transactions are `SqlClient.withTransaction`,
  errors are `SqlError` with a typed `reason`, logging is an `EffectLogger` service. Nothing in
  the code awaits a Drizzle promise. *Rejected:* `@effect/sql` alone with `sql` templates and
  `SqlResolver` (hand-written SQL per query, no typed tables, no migrations tool); Drizzle's own
  `pg` driver (a second connection pool beside Effect's, and no shared transaction).
- **D2 — The table is the one declaration; the codecs are derived.** `createSelectSchema` and
  `createInsertSchema` with a refine of the columns that carry a domain type (ids, `DateTime`,
  `Option`, `jsonb`) give the row codecs; the repository decodes to the model's fields and encodes
  the model to a row, with no mapping function. The domain stays the source of truth: its
  `Schema.Class` models, literals and brands are unchanged and the enums and checks read its
  constants. *Rejected:* `$type` and `customType` columns with hand-built models (a mapping
  function per entity, and `Option` still by hand); a hand-written `Schema.Struct` per row (the
  table twice); deriving the domain from the tables (the domain would import Drizzle).
- **D3 — The transaction is `SqlClient.withTransaction` as the use case's pipeable.** It stands
  where `userLock.withPermit` stood; every repository call inside joins it through the
  `TransactionConnection` service that `@effect/sql` puts in the fiber context, and a nested
  one is a savepoint. One `PgClient` per process, since the service is keyed by client. *Rejected:*
  a domain `Transaction` port with one adapter (a seam nothing varies across);
  `db.transaction((tx) => …)` (the `tx` parameter is the same mechanism with a second name).
- **D4 — The outbox is a `QueueClient`, the relay is a worker layer, a published row is
  deleted.** `QueueClientOutbox.send` inserts the encoded job, so the jobs and the use case do not
  change and the insert joins the send's transaction by D3. The relay in the worker takes rows
  with `FOR UPDATE SKIP LOCKED`, sends each to SQS through `QueueTransport` and deletes it in the
  same transaction; delivery is at-least-once and the handlers are idempotent. *Rejected:* an
  eager publish from the api after commit with the relay as a backstop (two paths, systematic
  duplicates); a `sent_at` mark (a second table to sweep); a domain `Outbox` port written beside
  `enqueue` (two concepts, every job changed); `LISTEN`/`NOTIFY` to wake the relay (a polling
  interval of a second is enough and needs no second connection).
- **D5 — Guards are single statements that answer with a value; `UserLock` goes.** The partial
  unique index holds "one active message per chat"; `insert` uses `ON CONFLICT (chat_id) WHERE
  <active> DO NOTHING RETURNING id` and answers `false`; `update(…, { from })`, `bind` (`WHERE
  message_id IS NULL`), `updateTitle` (`WHERE title IS NULL`) and `touch` (`updated_at` only) are
  each one `UPDATE` whose row count is the answer. The application raises the domain error, so
  ports keep no error channel, and the "re-read before write" pattern (`touchChat`, the title
  job's second read) disappears. Two api processes are safe without any shared lock. *Rejected:*
  catching `UniqueViolation` by constraint name in the adapter (a port with a domain error, five
  lines to unwrap `EffectDrizzleQueryError`); `SERIALIZABLE` isolation (retries on every
  conflict, including unrelated ones); advisory locks (a lock again, now in the database).
- **D6 — Read models live in the domain; the adapter answers them with relational queries.**
  `MessageDetail`, `ChatSummary` and `ChatDetail` move to `domain/chat`; `ChatRepository` gains
  `selectSummaries` and `selectDetail`, which `ChatRepositoryPg` runs as one `db.query` each over
  the relations declared once in `infrastructure/db/relations.ts`. The service becomes one port
  call, and the port stays the seam. *Rejected:* composing the detail in the service from three
  port reads (N+1 reads, the shapes in the wrong layer); exposing `db.query` to the service
  (the adapter leaks).
- **D7 — The cascade is the database's.** `messages.chat_id` cascades, `attachments.message_id`
  restricts, so `ChatService.delete` is one `delete` and a wrong order (a chat before its
  attachments) fails instead of leaving rows. The use case still removes the attachments first,
  since their bytes in S3 are outside the transaction. *Rejected:* explicit deletes per aggregate
  with the "retry finishes the cascade" ordering (three statements, and no guard against the
  wrong order).
- **D8 — Stuck replies are settled by a consumer of the dead-letter queue, defined as a queue
  with no last attempt.** Every path that leaves a reply active ends with its job in
  `assistant-message-dlq` (`aws-local`), so a `worker()` over a definition for that queue closes
  them with the same `failReply` the job uses, guarded by `update(…, { from })`. The definition's
  `maxAttempts` is unreachable and its delay capped, because a dead-letter queue has no redrive.
  The title dead-letter consumer only logs. *Rejected:* a time-based sweep of active messages (it
  cannot tell a dead reply from a backlog); a dead-letter queue for the dead-letter queue.
- **D9 — Time and ids come from the domain; the database defaults are fallbacks.** Columns carry
  no `DEFAULT now()`, no `$onUpdate`; `id` keeps `DEFAULT uuidv7()` for hand-written SQL. The
  driver returns `timestamptz` as a `Date` at millisecond precision, which is the precision the
  domain writes. *Rejected:* `$onUpdate` (a second clock, divergent from `TestClock`);
  `mode: 'string'` columns with a string codec (microseconds the domain never produces).
- **D10 — Tests share one Postgres per run, and each test takes a fresh database from a migrated
  template.** A test sees only the rows it wrote, also through readers of a whole table (the
  relay, the dead-letter consumers, later reports), at about 40 ms per test (create, connect,
  drop; the container starts once in about 1.2 s). The `globalSetup` lives in
  `infrastructure/db/testing` because it runs the migrator; the protocol and the per-test layer
  live in `@app-template/testing` because every workspace's tests use them and they need only
  `@effect/sql-pg`; `setupTemplateDatabase`'s TSDoc states what the template needs before its
  first copy. MiniStack keeps its container per file.
  *Rejected:* a database per file with rows scoped by owner (breaks on whole-table readers, and
  the boundary rests on discipline); `TRUNCATE` between tests (a table list to maintain, skipped
  when a test crashes, longer with every table); a rolled-back transaction per test (turns the
  real transactions and the concurrency tests into savepoints, and hides uncommitted rows from a
  second connection); a container per file (2 s plus migrations per file); PGlite (a second
  driver and database type, the production path untested); `withReuse()` (a container that
  outlives `make test`).
- **D11 — The local database is an RDS instance on MiniStack, in the `local` stack of
  `deployment/aws`.** The Docker project only runs MiniStack (now with the host's Docker socket
  and the RDS variables), so `make down` can destroy it alone while the instance stays in the
  `aws` stack's state and respawns with its named volume. `make reset` destroys the instance, then
  removes the volume MiniStack leaves behind, then wipes `.data`, which also resets MiniStack's
  port counter, so `RDS_BASE_PORT` is the instance's port whenever it is created. `make up`
  verifies that the container MiniStack labels `ministack=rds` and `db_id=<identifier>` publishes `DATABASE_URL`'s port, since
  MiniStack reports `available` even when the host port was taken. `maxAllocatedStorage` is set
  to stop a refresh drift. The fallback of `feature.md` R16 stands: a plain `postgres:18.6-alpine`
  container in `deployment/local` on the same `DATABASE_URL`. *Rejected:* one project with two
  stacks (`make down` would destroy the instance and its data, as on AWS); reading the endpoint
  from `pulumi stack output` at startup (runtime discovery).
- **D12 — SQL is logged at `Debug` by our own `EffectLogger` layer.** Drizzle's `EffectLogger.layer`
  logs with `Effect.log()`, that is at `Info`, which would print every statement in production.
  *Rejected:* Drizzle's layer gated by `LOG_LEVEL` in the composition root (two places decide one
  thing).
- **D13 — Migrations are drizzle-kit SQL applied by Drizzle's Effect migrator, never by the apps.**
  `make migration NAME=…` generates with no database, `make migrate` applies through an Effect
  program on `DatabaseConfig`, the test setup applies the same way, and `make migration-check`
  fails `make check` when an entity changed without a migration. *Rejected:* Effect's
  `PgMigrator` (loads `.ts` modules, so each SQL file needs a wrapper and a second ledger);
  `drizzle-kit push` or `migrate` (reads credentials outside `@app-template/config`).
- **D14 — Drizzle's source is a subtree in `repos/drizzle`, pinned to the catalog.** Agents check
  APIs against `repos/drizzle/drizzle-orm/src`, as `effect.md` has them do for Effect; the rc line
  changes between releases and the docs lag. The subtree is the whole monorepo (kit, zod,
  integration tests), since `git subtree` takes no subfolder. *Rejected:* `node_modules` `.d.ts`
  only (no implementation to read, and `drizzle-orm/effect-postgres` is thinly documented).
- **D15 — One `DATABASE_URL`, read as `Redacted` by `DatabaseConfig`.** The Pulumi program and the
  instance's credentials derive from the same URL, so `.env` holds the database once.
  *Rejected:* host, port, user, password, name as five variables (five places to keep in step
  with the instance).
- **D16 — `drizzle-orm` and `drizzle-kit` share the `drizzle` catalog namespace.** `drizzle-kit`
  peers `drizzle-orm >=1.0.0-rc.5`: one release train, bumped together. *Rejected:* `drizzle-kit`
  in `tools` (it shapes the migrations, and lags the orm by hours).

## Risks

| Risk | Mitigation |
|---|---|
| `drizzle-orm@1.0.0-rc.*` moves between rcs (`EffectDrizzleQueryError.cause` is typed `unknown`, `defineRelations` is the rc relations API) | pinned exactly; every API checked in `repos/drizzle` at the step that uses it; D5 avoids unwrapping errors |
| `defineRelations` and the relational `db.query` on the Effect driver are read from source, not run | S4 runs a relational query live before any repository is written; if it fails, `selectDetail` is a join query behind the same port |
| `ON CONFLICT (chat_id) WHERE <predicate>` must match the partial index's predicate exactly, or Postgres finds no arbiter | the predicate is one `sql` constant used by both the index and the insert; Seam 3 inserts two active messages |
| A transaction that holds the `FOR UPDATE SKIP LOCKED` rows while SQS is slow blocks nothing but delays the batch | batch of 10, the transport's own timeout; a failed send fails the batch and the rows stay |
| The relay republishes after a crash between send and commit | at-least-once as before; handlers skip settled replies and titled chats |
| A dead-letter handler that keeps failing loops every 5 minutes forever | logged each attempt; `OUTBOX`-style sweeps are out of scope; ticket 8 makes it visible |
| MiniStack's port counter moves if the instance is re-created without a reset | `make down` never destroys the instance; `make reset` wipes the state; `check-database.ts` fails `make up` on a mismatch |
| MiniStack reports `available` when the host port is taken by another container | `check-database.ts` looks for the `ministack=rds` container publishing the port |
| MiniStack writes its RDS state only on a graceful stop; a killed MiniStack orphans the instance's container | `make down` stops through Pulumi with a grace period; `make reset` removes the `ministack-rds-*` container and volume of this tree's identifier |
| Two worktrees share the host's Docker, and MiniStack names the RDS container by account, region and identifier | each worktree sets its own `STAGE`, which the identifier carries |
| The named volume survives `destroy` and resurrects data under the same identifier (and skips `initdb`, so a changed password would not apply) | `make reset` removes the volume; the password lives in `DATABASE_URL` and changes with a reset |
| ~80 s per provider operation on the instance | paid once per `make up` from a clean state and once per `make reset`; a no-op `make up` runs no refresh |
| `CREATE DATABASE … TEMPLATE` fails while the setup's pool is open | `setupTemplateDatabase` requires its `migrate` to close its client before it returns; Seam 2 covers a first copy |
| `provide`/`inject` typing (`ProvidedContext` augmentation) under the patched `tsc` was not checked | S1 adds the augmentation in `packages/testing` and `make typecheck` decides |
| The Drizzle monorepo is large (size unknown; the clone was denied) | S1 measures `du -sh repos/drizzle`; above several times `repos/effect`, the user decides |
| The `skipLibCheck: false` path fails on Drizzle's `.d.ts` under `exactOptionalPropertyTypes` | `tsconfig.base.json` keeps `skipLibCheck: true`, as today |
| Application tests on a real database are slower than on memory | a database per test costs ~40 ms (create, connect, drop; measured in S1); the container starts once in ~1.2 s; `make test` stays under Docker as it is |

## To verify during implementation

- `defineRelations` and `db.query.<table>.findMany({ with, where, orderBy, limit })` on
  `drizzle-orm/effect-postgres` rc.5, and the shape of nested rows for the codecs (S4).
- `onConflictDoNothing({ target, where })` on the partial index through Drizzle, or `sql` for
  that one insert (S7).
- `createSelectSchema` with a refine of `uuid[]` to `Schema.Array(AttachmentId)` and of `jsonb`
  to `Schema.OptionFromNullOr(MessageFailure)` (S4).
- `PgClient.layer({ url })` from a `Redacted` (S1) and the Debug `EffectLogger` annotations in
  the output of `make dev-api` (S6).
- The Docker socket mount through `@pulumi/docker` (`volumes: [{ hostPath: '/var/run/docker.sock',
  containerPath: '/var/run/docker.sock' }]`) on Docker Desktop (S3).
