# Database

How the app stores its records in Postgres: where the tables are declared, how a row becomes a
domain model, how the schema changes, and how tests get a database. The code:
`packages/db/` (`@app-template/db`, which knows no table: `createDb`, `Transaction`, the shared
columns, the query helpers, `migrateDatabase(folder)` and `retryWhileUnreachable`),
`kernel/postgres/` (`PgClientFromConfig`, the `PgClient` built from `DatabaseConfig`, and the
migrate program), `kernel/data/` (the client `Db`, made by `createDb(relations)` over the
`PgClient` in the context; the tables, their entities, the relations, the migrations and
`drizzle.config.ts`; the data layer's repositories over them) and the mappers in a module's
`services/` (`UserFromEntity`, `ChatFromEntity`).
Drizzle runs on `@effect/sql-pg` and is reached only through Effect: every query is an `Effect`,
never a promise.

## Schema and entity files

The data layer, `kernel/data/<store>/`, declares each table in `<name>.table.ts` and its
entities, the schemas read from it, in `<name>.entity.ts` (`user/user.table.ts`: `users`,
`credentials`; `chat/chat.table.ts`: `chats`; `chat/message.table.ts`: `messages`;
`attachment/attachment.table.ts`: `attachments`; `job/job.table.ts`: `jobs`); what each
may import: [kernel/CLAUDE.md](../../kernel/CLAUDE.md). Since a table imports no entity,
`ChatEntity` and `MessageEntity` nest `AttachmentEntity` without a cycle. The tables are the one
declaration of the schema: the migrations are generated from them and the entities derived
from them.

- **Names.** A table is declared with `snakeCase.table` from `drizzle-orm/pg-core`, so the
  `camelCase` keys in code (`createdAt`) become `snake_case` columns (`created_at`) with no name
  spelled twice.
- **Shared columns** come from `packages/db/columns.ts`: `id()`, a `uuid` primary key with
  `DEFAULT uuidv7()`, and `createdAt()` and `updatedAt()`, `timestamptz` columns with no default
  and no `$onUpdate`. The domain writes every id and every timestamp with its own clock, so
  `TestClock` holds and there is no second clock; the `uuidv7()` default serves only
  hand-written SQL.
- **Enums and checks state the data layer's own values.** An enum lists its values
  (`pgEnum('message_status', ['queued', …])`), and a check declares its own pattern or limit
  beside the table (`credentials_hash_check` the pattern `SecretHash` checks with;
  `attachments_media_type_check` the one `MediaType` checks with, matched with `~*` for its `i`
  flag; `chats_title_check` the length `ChatTitle` caps), so a row written by hand cannot hold
  what the domain rejects. The model checks the same rule on its side, so a value lives twice: a
  change to one is a change to both. drizzle-kit inlines the values into the DDL, so a changed
  literal, pattern or limit changes the schema, and `make migration-check` fails until a
  migration exists.
- **A check is a backstop, never stricter than the brand.** It may let through what the brand
  refuses, never the reverse: `chats_title_check` trims spaces only and counts code points, where
  `ChatTitle` trims every whitespace and counts UTF-16 units. Checks are named
  `<table>_<column>_check`, indexes `<table>_<columns>_index` and partial indexes
  `<table>_<columns>_<predicate>_index` (`messages_chat_id_active_index`).
- **A rule across rows is a partial unique index.** `messages_chat_id_active_index` allows one
  active assistant message per chat; its predicate is `activeMessage`, exported from
  `message.table.ts` beside the table, with the active statuses listed there. An
  `ON CONFLICT … WHERE` that targets the index takes its predicate from this constant, which
  renders as literals (`.inlineParams()`): a generic plan, which Postgres switches a prepared
  statement to after five runs, cannot prove the index predicate from bound parameters.
- **A descending index states its null order.** Drizzle's `desc()` indexes nulls last while
  Postgres's `ORDER BY … DESC` sorts them first, so an index for that order is
  `.desc().nullsFirst()` (`chats_user_id_updated_at_index`).
- **Foreign keys say what a delete does.** `credentials`, `messages` and a bound attachment's row
  cascade from their parent, so a chat's delete is one statement. The attachment's key is the pair
  `(message_id, chat_id)` over `messages (id, chat_id)`, so `chat_id`, which a bind writes beside
  `message_id` to find a chat's attachments without its messages, can only name the message's
  chat, and a check keeps both null or both set. The cascade never reaches S3: whoever deletes a
  chat or a message deletes the bytes too.
- **A link lives in one foreign key, never in an array beside it.** Postgres cannot hold a
  foreign key on array elements, so a copy would drift: a message's attachments are the rows
  whose `attachments.message_id` names it, and `messages` keeps no list of them. They read in
  upload order, `created_at` then `id`, whatever order the send listed them in;
  `attachments_message_id_created_at_id_index` serves that order.

## Entities and mappers

An entity file derives its schemas from the table with `createSelectSchema` and
`createInsertSchema` from `drizzle-orm/effect-schema`, in the data layer's own types (`string`,
`string | null`, `Date`), beside the `<Name>EntityWhere` and `<Name>EntitySet` its reads and
writes filter and change by. An entity is the shape every read returns, so a chat's and a
message's nest their attachments:

```ts
export const ChatEntity = Schema.Struct({
  ...createSelectSchema(chats).fields,
  attachments: Schema.Array(AttachmentEntity),
})
```

A mapper, `<model>.mapper.ts` in the module's `services/`, lays the model's schemas over the
entity's fields and pipes the struct into the model; services and tests decode and encode
with it:

```ts
export const UserFromEntity = Schema.Struct({
  ...UserEntity.fields,
  id: UserId,
  createdAt: Schema.DateTimeUtcFromDate,
}).pipe(Schema.decodeTo(User))
```

- A refinement given as a schema replaces the column's schema whole: nothing adds `NullOr` or
  makes it optional, so a nullable column is laid as `Schema.OptionFromNullOr(…)`. A refinement
  given as a function (`{ error: () => MessageFailureJson }`) keeps the column's `NullOr`.
- A model nested in another (an attachment in a chat, the failure in a message) is laid by its
  encoded side, `AttachmentFromEntity.from` or `Schema.toEncoded(MessageFailure)`; why: the
  comment in `application/chat/services/chat.mapper.ts`.
- A service writes a model encoded through its mapper and decoded with `<Name>EntityInsert`,
  which cuts the nested attachments and checks the row. A value already in the data layer's
  types (brands, literals) is passed as is: `UserRepository.insert` takes the credential with
  no mapper and writes `{ hash, kind, userId }`, the user's id from the row it inserted.
- A `jsonb` column carries its shape's type (`jsonb().$type<typeof MessageFailureJson.Type>()`),
  declared as a schema beside the table, so the row Drizzle returns fits the entity.

## Relations

`kernel/data/relations.ts` declares the relations once, with `defineRelations` over every
table, and `Db` is built with them (`PgDrizzle.make({ relations })`), so `db.query.<table>` is
typed. A relation names its columns (`from`, `to`) and joins on their equality only, and holds
no order: a query states it with `orderBy`. A relational query returns nested rows of the same
shape as a `select`, so they decode with the same entities:

```ts
const rows = yield* db.query.messages.findMany({
  with: { attachments: { orderBy: { createdAt: 'asc', id: 'asc' } } },
})
// rows: [{ id, chatId, …, attachments: [{ id, userId, messageId, … }] }]
```

`ChatRepository` and `MessageRepository` read a chat or a message `with` its attachments, in one
relational query: `Chat.attachments` and `Message.attachments` are the model fields another
table holds, read and never written by their own writes, since `AttachmentService.bind` binds
them. A relational query aliases its table, so the chat's `where` is built on the table the
query hands to `RAW`, never on the `chats` constant.

## Repositories

A repository is a `Layer` over `Db` and `SqlClient` in its entity's `.repository.ts` (names:
[naming.md › Symbols](../../.claude/rules/naming.md#symbols)). The data layer's,
`UserRepository` in `kernel/data/user/`, `ChatRepository` and `MessageRepository` in
`kernel/data/chat/`, `AttachmentRepository` in `kernel/data/attachment/` and `FileRepository`
over the attachments' objects in `kernel/data/file/` ([aws.md › Attachments](aws.md#attachments)),
speak entities:
they take a `<Name>EntityInsert`, a `<Name>EntitySet` and a `<Name>EntityWhere` and answer
`<Name>Entity`. A module's service calls one directly, with no port in front, and maps with its
module's mapper (`UserService` over `UserRepository`). A method that writes several tables runs
them in one `sql.withTransaction`, passed to `Effect.fn` as a pipeable:
`UserRepository.insert` writes the user and its credential, or neither. `SqlClient` is the
`PgClient` that `Db.layer` takes from the context (`PgClientFromConfig` in the processes, `DbTest`
in the e2e), so the transaction runs on the connection `Db` uses. Every method ends with
`orDieWithSqlError` from `@app-template/db`.

A module's services and the use cases call the data layer's repositories through the
`<Model>FromEntity` mappers of the module's `services/`: a write encodes the model through its
mapper and decodes the row with `<Name>EntityInsert`, the set and the `where` map each `Option`
to `null`, and a read decodes the entities into models; a mapping failure dies.

Reads go through relational queries (`db.query.<table>.findFirst` and `findMany`), writes
through the core builder (`db.insert`, `db.update`, `db.delete`). A read of at most one row is a
`findFirst`, which emits the `limit 1` itself, even where a key makes the row unique, so the
query states its intent; `decodeOptionalRow(<Name>Entity)` from `@app-template/db` decodes the
row it found, or answers `Option.none()` for the `undefined` or `null` of none. A filter on a
relation (`{ credentials: { kind, hash } }`) renders as `exists (…)`.

A write of some fields under a condition maps its `<Name>EntitySet` and `<Name>EntityWhere` onto
the table through `packages/db/columns.ts`, one mapper per field.
`buildSet<Fields, Table>(columns)` takes a `SetColumns<Fields, Table>`, each mapper typed by the
table's column (`PgUpdateSetSource<Table>`), and answers the row Drizzle's `set` takes;
`buildWhere<Fields>(columns)` takes a `WhereColumns<Fields>`, each mapper answering
`SQL | undefined`, and joins them with `and`. A mapper answering the wrong shape, a field the
type gains without a mapper, and a mapper for a field the table has no column for all fail
typecheck. The builders walk the mapper table's keys, so a whole entity passed as a set writes
only the fields it may change; an absent field maps to `undefined` (`UndefinedOr.map`), which
Drizzle's `set` and `and` skip.

## Guards

A rule that two writers could break between a read and a write is held by the database, in the
statement that writes. The caller checks the rule first, so a write the guard refuses only lost
a race: every repository's `insert`, `update` and `delete` dies when it touches no row:

- **Insert under a partial unique index.** `MessageRepository.insert` adds `ON CONFLICT
  (chat_id) WHERE <activeMessage> DO NOTHING RETURNING id` (Drizzle's `onConflictDoNothing({
  target, where })`), so a second active reply in a chat writes nothing and dies. Any other
  message inserts. The chat's status decides the race first (below), so this index only backs it.
- **A status move under the status read.** `SendMessageUseCase.send` reads the chat, runs
  `queueChat` (a `queued` chat is `ChatBusyError`) and moves the status to `queued` `WHERE status
  = <the status it read>` as its first write. Of two sends that both read the chat `idle` at
  once, the second waits on the first's row lock, then matches no row and dies, rolled back
  whole: a lost race of that narrow window answers 500, any later send reads `queued` and
  answers 409. The reply's end (`settle` in `GenerateAssistantMessageUseCase`) moves it by
  `idleChat` or `failChat` the same way, in the transaction that settles the message, so the
  chat's status and its active message move together; a path that ends a reply anywhere else
  must move the chat too, or the chat stays `queued`.
- **Update under a `where`.** `MessageRepository.update(set, where)` writes the message's
  status, text, error and `updatedAt` `WHERE id = … AND status IN (…)`: the reply's use case
  passes the encoded message as the set, and its id and the stored status to match as the
  `MessageEntityWhere`, so a write whose expected status another writer has left, or whose
  message is gone, changes nothing and dies; the job's retry then reads the message and skips it
  as settled or deleted.
- **Update of some fields under a `where`.** `ChatRepository.update(set, where)` and
  `AttachmentRepository.update(set, where)` write only the fields of `set` (`ChatEntitySet`,
  `AttachmentEntitySet`: `RequireAtLeastOne` from `type-fest`, so an empty write fails typecheck)
  where the rows match `where` (`ChatEntityWhere`, `AttachmentEntityWhere`: a key, one id or a
  list of them for attachments, and optionally a field the row must still hold, `null` rendering
  `IS NULL`). The repository maps each side through `buildSet` and `buildWhere` (above); a
  service encodes the changed model through its mapper and writes the set's fields from the row,
  and `encodeChatWhere` turns the `Option` of a chat's `where` into `null`. Both die when they
  write nothing. A status move writes the status alone, so a title written meanwhile survives it.
  - `ChatService.rename` reads the chat by the caller's `where` to name a refusal
    (`ChatNotFoundError`), then writes under the same `where`. The title job passes `title:
    none`, so a rename landing between the two wins and the job dies and retries.
  - `AttachmentService.bind` checks the ids on rows it reads `forUpdate`, then writes the message
    `where` `messageId` is still `none`: a second send binding one of them waits on the lock and
    then fails `AttachmentBoundError` in the check. A send without files binds nothing and skips
    the write, which would die on no rows.

`ChatRepository.delete(where)` is one statement and dies when it removes nothing; its messages
and their attachments go by the cascade, and `RETURNING` answers only the chat's row.
`ChatService.delete` therefore reads the chat with its attachments to name `ChatNotFoundError`,
then deletes the chat, then the bytes, through
`FileRepository.delete` (one `DeleteObjects` per 1000 keys). A file a concurrent send binds
between the read and the delete loses its row with the chat while its bytes stay in S3, bound and
never expired: the price of a delete with no transaction.

## Transactions

A use case that writes several aggregates commits them together: `Transaction.run` is a pipeable
of the `Effect.fn` that holds the writes (`Transaction.layer` in `packages/db/db.client.ts`
wraps `SqlClient.withTransaction`), and every repository call inside joins the transaction
through the connection `@effect/sql` keeps in the fiber's context, so no repository takes a
transaction parameter. `SendMessageUseCase.send` writes the chat's `status`, the user message,
the binds, the reply and its jobs, or none of them. The guards above then decide every race inside
Postgres, with no lock in the process: of two sends to one chat the second waits on the chat's
row lock and, once the first commits, finds the chat `queued`, and of two binds of one
attachment the second waits on the attachment's row lock and finds it bound. Two api processes behave as two
fibers. S3 stays outside the transaction: the bytes are kept before the bind, so no bound row sits
over expiring bytes, and deleted before the commit, so a rollback restores rows that a retry still
finds. SQS is reached only through the table `jobs`, whose rows join it.

## Stuck replies

A reply that no attempt settles stays active and its chat `queued`, so every next send to the chat
fails `ChatBusyError` until the worker fails it from the dead-letter queue
([aws.md › Queues](aws.md#queues)). No sweep over active messages exists: by age alone it could
not tell a dead reply from one waiting in a backlog.

## The outbox

A job reaches SQS through the table `jobs`, so it commits or rolls back with the writes that
enqueue it (the transactional outbox): `apps/api` provides `QueueSenderJobs` as its `QueueSender`
and never sends to SQS, and `apps/worker` consumes through `QueueConsumerSqs` beside the relay.
The three live in `kernel/queue/` over `JobRepository` (`kernel/data/job/job.repository.ts`),
which inserts a job, selects the unsent ones and sets their `sentAt`.

- **`QueueSenderJobs`** (`kernel/queue/queue.client.ts`) is the `QueueSender` whose `send`
  encodes the job through its definition's schema to a JSON value (`Schema.toCodecJson`) and
  inserts a row: the definition's `name` as `queue` (the stage is added on the way out), the
  `jobId` and the value as `body`. The insert joins the caller's `sql.withTransaction`; outside
  one it commits alone.
- **`body` is `jsonb`, with no index on it.** No code queries the body: the column holds the
  value for the relay, and `jsonb` keeps it a value an operator can read by hand
  (`body->'provenance'->>'model'` on a reply's job) instead of a string to parse. `jsonb` stores keys in its own order, so
  the string the relay sends is the row's, not the sender's.
- **`JobRelay`** (`kernel/queue/job.relay.ts`), a layer the worker provides as `JobRelaySqs`, polls
  in one transaction: it selects up to 10 rows `WHERE sent_at IS NULL ORDER BY created_at, id`
  `FOR UPDATE SKIP LOCKED`, sends each over `QueueTransport` to `buildResourceName(STAGE, queue)`
  with its `jobId` and its `body` as a JSON string (`JSON.stringify`, the form the SQS client
  sends), sets their `sent_at` and commits. A full batch polls again at once; a shorter one
  waits `OUTBOX_POLL_INTERVAL` (1 second by default).
- **A sent row stays,** so `jobs` is the record of what each job carried; the partial index
  `jobs_unsent_created_at_index` holds only unsent rows, so the poll stays cheap however many
  sent rows pile up. Nothing removes sent rows yet.
- **Several relays share the table.** `SKIP LOCKED` hands a row to one relay at a time, and the
  others take the next rows or none.
- **A failed batch rolls back,** so its rows stay: the relay logs `outbox relay failed` with
  the cause and polls again after `OUTBOX_POLL_INTERVAL`. Rows sent before the failure in the
  same batch are sent again, as is a batch whose commit a crash cuts off: delivery is
  at-least-once.

## Migrations

The schema changes only through SQL migrations that drizzle-kit generates from the table files
and that are committed.

| Command | Does |
|---|---|
| `make migration NAME=<name>` | `drizzle-kit generate --config kernel/data/drizzle.config.ts` from the root, whose paths it resolves against the working directory: compares the table files with the last snapshot and writes `kernel/data/migrations/<timestamp>_<name>/` (`migration.sql`, `snapshot.json`); needs no database |
| `make migrate` | applies the pending migrations to `DATABASE_URL` through `migrateDatabase(folder)` on `DatabaseConfig`; with none pending it logs `nothing to apply`; while the database refuses connections it retries, logging `database not reachable yet, retrying`; any other failed connection or query logs its cause at once |
| `make migration-check` | generates into the folder and fails, printing the missing SQL, if a new folder appeared; it removes that folder |

- **`make migration-check` is soft locally and strict in CI.** In `make check` it counts every
  folder in the tree, committed or not, so a step that adds a migration stays green before its
  commit. CI runs it on a fresh checkout, which holds only committed migrations, so there an
  table changed without a committed migration fails the build.
- Commit `migration.sql` and `snapshot.json` together. The ledger `drizzle.__drizzle_migrations`
  records each migration once, so an edit never reaches a database that already applied it.
- **Until a deployed database holds data, the migrations stay one `init`.** A change that
  drizzle-kit cannot write alone (a rename it asks about, values to carry over) deletes
  `kernel/data/migrations/` and regenerates it with `make migration NAME=init`, never a
  rename by `--hints` or hand-written SQL; a local database rebuilds by `make reset && make up`.
  The first deployed database ends this: from then on a committed migration is never edited.
  A database migrated before `init` replaced the two earlier migrations needs `make reset` once.
- The apps neither migrate nor check the schema at startup; only `make migrate` and the tests'
  setup apply migrations.
- Biome skips `kernel/data/migrations/`: the files are drizzle-kit's output, and a
  reformatted snapshot would differ from the next one it writes.

## The local database

`make up` creates it as an RDS instance inside MiniStack and writes its `DATABASE_URL` to
`.env.pulumi`: [aws.md › The local stand-in](aws.md#the-local-stand-in).

## Tests

Each e2e test runs on a database of its own, copied from a template that the run's setup
migrates with the `make migrate` program ([tooling.md › Tests](tooling.md#tests)). A data
layer's repository has a `.repository.e2e.ts` in `kernel/__e2e__/data/<store>/` on `DbTest`, in
entities, its parent rows written through `Db`. An
`.entity.e2e.ts` in `kernel/__e2e__/data/<store>/` checks, in entities only, what the schema
itself refuses (a check, a partial unique index) and reads the `SqlError` of a refused statement
with `flipSqlError` from `@app-template/db/testing-e2e`. A limit or a pattern the data layer
declares again beside a model has a `.mapper.e2e.ts` in `apps/__e2e__/mappers/`: it writes the
model's extreme value through the mapper and reads it back, so a check that drifts from its model
fails there.

The unit suites never reach Postgres ([tooling.md › Tests](tooling.md#tests)). What only a
transaction decides, that a use case keeps none of its writes or its jobs when one is
refused, runs in `apps/__e2e__/use-cases/` on `ChatPgTest`. A memory layer copies the four guards the
database adds (the active message's index, the message status an update expects, an owner in the
`where`, the cascade from a chat to its messages and their attachments), and each has its twin in a repository suite
([effect-tests.md › Unit and e2e](../../.claude/rules/effect-tests.md#unit-and-e2e)).
