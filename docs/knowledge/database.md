# Database

How the app stores its records in Postgres: where the tables are declared, how a row becomes a
domain model, how the schema changes, and how tests get a database. The code:
`infrastructure/db/` (the client `Db`, the shared columns, the relations, the migrations and the
migrate program), `infrastructure/<aggregate>/<entity>.entity.ts` (the tables) and
`infrastructure/drizzle.config.ts`. Drizzle runs on `@effect/sql-pg` and is reached only through
Effect: every query is an `Effect`, never a promise.

## Schema and entity files

Each entity declares its tables in one file beside its repository,
`infrastructure/<aggregate>/<entity>.entity.ts`, one file per entity as the aggregate's
repositories are split (`user/user.entity.ts`: `users`, `credentials`; `chat/chat.entity.ts`:
`chats`; `chat/message.entity.ts`: `messages`; `attachment/attachment.entity.ts`:
`attachments`; `outbox/outbox.entity.ts`: `outbox`, which no model maps, so it has no codec).
The tables are the one declaration of the schema: the migrations are generated
from them and the row codecs derived from them.

- **Names.** A table is declared with `snakeCase.table` from `drizzle-orm/pg-core`, so the
  `camelCase` keys in code (`createdAt`) become `snake_case` columns (`created_at`) with no name
  spelled twice.
- **Shared columns** come from `infrastructure/db/columns.ts`: `id()`, a `uuid` primary key with
  `DEFAULT uuidv7()`, and `createdAt()` and `updatedAt()`, `timestamptz` columns with no default
  and no `$onUpdate`. The domain writes every id and every timestamp with its own clock, so
  `TestClock` holds and there is no second clock; the `uuidv7()` default serves only
  hand-written SQL.
- **Enums and checks read the domain.** An enum takes its values from the domain's literal
  (`pgEnum('message_stage', MessageStage.literals)`), and a check reads the constant its brand
  checks with (`credentials_hash_check` matches `secretHashPattern.source`, as `SecretHash` does;
  `attachments_media_type_check` matches `mediaTypePattern.source` with `~*`, for its `i` flag;
  `chats_title_check` caps the length at `maxTitleLength`), so a row written by hand cannot hold
  what the domain rejects. drizzle-kit inlines the constants into the DDL, so a changed literal,
  pattern or limit changes the schema, and `make migration-check` fails until a migration exists.
- **A check is a backstop, never stricter than the brand.** It may let through what the brand
  refuses, never the reverse: `chats_title_check` trims spaces only and counts code points, where
  `ChatTitle` trims every whitespace and counts UTF-16 units. Checks are named
  `<table>_<column>_check`, indexes `<table>_<columns>_index` and partial indexes
  `<table>_<columns>_<predicate>_index` (`messages_chat_id_active_index`).
- **A rule across rows is a partial unique index.** `messages_chat_id_active_index` allows one
  active assistant message per chat; its predicate is `activeMessage`, exported from
  `message.entity.ts` beside the table, with the stages from `ActiveMessageStage.literals`. An
  `ON CONFLICT … WHERE` that targets the index takes its predicate from this constant, which
  renders as literals (`.inlineParams()`): a generic plan, which Postgres switches a prepared
  statement to after five runs, cannot prove the index predicate from bound parameters.
- **A relational read filters with an object, not the predicate.** A relational query aliases
  its tables (`d0`, `d1`), while `activeMessage` names `"messages"."author"`, so the read of
  the active message states the same condition as an object filter, `activeMessageFilter`
  beside it (`{ author: 'assistant', stage: { in: … } }`), its stages from the same
  `ActiveMessageStage.literals`; a query that filters for the active message spreads it, and
  a read that already holds the chat's messages picks it with `isActiveMessage`.
- **A descending index states its null order.** Drizzle's `desc()` indexes nulls last while
  Postgres's `ORDER BY … DESC` sorts them first, so an index for that order is
  `.desc().nullsFirst()` (`chats_user_id_updated_at_index`).
- **Foreign keys say what a delete does.** `credentials` and `messages` cascade from their parent;
  `attachments.message_id` restricts, so a message with a bound attachment cannot be deleted
  before it.
- **A link lives in one foreign key, never in an array beside it.** Postgres cannot hold a
  foreign key on array elements, so a copy would drift: a message's attachments are the rows
  whose `attachments.message_id` names it, and `messages` keeps no list of them. They read in
  upload order, `created_at` then `id`, whatever order the send listed them in;
  `attachments_message_id_created_at_id_index` serves that order.

## Codecs

An entity file derives a row codec with `createSelectSchema` or `createInsertSchema` from
`drizzle-orm/effect-schema` only for a table whose columns differ from the model's fields: a
`Date` that is a `DateTime.Utc` in the model, an id to brand on the way back.

```ts
const userFields = { id: UserId, createdAt: Schema.DateTimeUtcFromDate }
export const UserRow = createSelectSchema(users, userFields)
export const UserInsert = createInsertSchema(users, userFields)
```

- A refinement given as a schema replaces the column's schema whole: nothing adds `NullOr` or
  makes it optional, so a nullable column is refined to `Schema.OptionFromNullOr(…)` and a column
  with a default becomes required, as the domain always writes it.
- Each entity file exports one decoder beside its codec (`decodeUser`, `decodeChat`), which
  decodes a row and builds the model from the fields (`new User(fields)`); repositories and
  tests share it. A decoder of rows nested across two entities lives in the entity file that
  already imports the other (`decodeMessageDetail` in `attachment.entity.ts`), since the reverse
  import closes a cycle Biome rejects. A repository encodes the model to the row it inserts. A row whose values are
  already the domain's (brands, literals) is written as is: `credentials` takes
  `{ hash, kind, userId }` from the credential and the user, with no codec.
- A `jsonb` column carries the encoded type of its schema (`jsonb().$type<typeof
  MessageFailure.Encoded>()`), so the row Drizzle returns fits the codec; the refinement
  (`Schema.OptionFromNullOr(MessageFailure)`) is what decodes it.

## Relations

`infrastructure/db/relations.ts` declares the relations once, with `defineRelations` over every
table, and `Db` is built with them (`PgDrizzle.make({ relations })`), so `db.query.<table>` is
typed. A relation names its columns (`from`, `to`) and joins on their equality only, and holds
no order: a query states it with `orderBy`. A relational query returns nested rows of the same
shape as a `select`, so they decode with the same codecs:

```ts
const rows = yield* db.query.messages.findMany({
  with: { attachments: { orderBy: { createdAt: 'asc', id: 'asc' } } },
})
// rows: [{ id, chatId, …, attachments: [{ id, userId, messageId, … }] }]
```

A read model is one relational query: the domain declares the shapes the ports answer
(`ChatSummary`, `ChatDetail`, `MessageDetail` in `chat.model.ts`), and the repository reads each
in one `db.query`, decoding every level with its entity's decoder. A model holds no field that
another table holds: `Message` has no attachments, which reach the reader as a `MessageDetail`.

## Repositories

A repository is a `Layer` over `Db` and `SqlClient` in its entity's `.repository.ts` (names:
[naming.md › Symbols](../../.claude/rules/naming.md#symbols)). A method that writes several tables
runs them in one `sql.withTransaction`, passed to `Effect.fn` as a pipeable:
`UserRepositoryPg.insert` writes the user and its credential, or neither. `SqlClient` is the
`PgClient` that `Db.layerFromConfig` and `DbTest` publish, so the transaction runs on the
connection `Db` uses. Every method ends with `orDieWithSqlError` from `db.client.ts`.

Reads go through relational queries (`db.query.<table>.findFirst` and `findMany`), writes
through the core builder (`db.insert`, `db.update`, `db.delete`). A read of at most one row is a
`findFirst`, which emits the `limit 1` itself, even where a key makes the row unique, so the
query states its intent; `decodeFound` from `db.client.ts` decodes the row it found, or answers
`Option.none()`. A filter on a relation (`{ credentials: { kind, hash } }`) renders as
`exists (…)`.

## Guards

A rule that two writers could break between a read and a write is held by the database, in the
statement that writes. A conditional write answers whether it wrote:

- **Insert under a partial unique index.** `MessageRepository.insert` adds `ON CONFLICT
  (chat_id) WHERE <activeMessage> DO NOTHING RETURNING id` (Drizzle's `onConflictDoNothing({
  target, where })`), so a second active reply in a chat writes nothing and answers `false`;
  the application turns that into `ChatBusyError`. Any other message inserts.
- **Update under a `where`.** `MessageRepository.update(message, where)` runs `WHERE id = …
  AND <where fields>`, its `where` (`MessageWhere`, the stored fields to match: `{ stage }`),
  so a write whose expected stage another writer has left changes nothing and answers `false`;
  the reply job then stops as settled by someone else.
- **Update of some fields under a `where`.** `ChatRepository.update(set, where)` and
  `AttachmentRepository.update(set, where)` write only the fields of `set` (`ChatSet`,
  `AttachmentSet`: `RequireAtLeastOne` from `type-fest`, so an empty write fails typecheck) where
  the rows match `where` (`ChatWhere`, `AttachmentWhere`: the `id`, an array of them for
  attachments, and optionally a field the row must still hold, `Option.none()` rendering `IS
  NULL`). The adapter maps each side with `Struct.evolve` over a table, `setColumns` and
  `whereColumns`, after `Struct.pick` by the table's keys, so a whole entity passed as a set
  writes only the fields it may change. Each table `satisfies` a row per field of its type, so a
  field the type gains fails typecheck until its row exists, and a row for no field fails too;
  an absent field stays `undefined`, which Drizzle's `set` and `and` skip. The chat's update
  answers whether it wrote, the attachments' with the rows it wrote (`RETURNING *`).
  - `ChatService.addUserMessage` sets the chat's `updatedAt` alone, so a title written
    meanwhile survives. It writes the chat before the message: a chat deleted since the check
    answers `false`, which the service turns into `ChatNotFoundError` instead of a foreign-key
    failure, and the written row stays held until the send commits, so a concurrent delete waits.
  - `ChatService.updateTitle` writes `where` the title is still `none` and, on `false`, reads
    the chat only to name the refusal (`ChatNotFoundError` or `ChatTitledError`), so a rename
    always wins.
  - `AttachmentService.bind` checks each id, then writes the message `where` `messageId` is
    still `none`, and raises `AttachmentBoundError` for an id the statement skipped because
    another send took it in between.

A delete needs no answer: `ChatRepository.delete` is one statement, the messages go by `ON
DELETE CASCADE`, and a message with an attachment makes it die (`RESTRICT`), so the attachments
are removed first.

## Transactions

A use case that writes several aggregates commits them together: `sql.withTransaction` is a pipeable
of the `Effect.fn` that holds the writes, and every repository call inside joins the transaction
through the connection `@effect/sql` keeps in the fiber's context, so no port takes a transaction
parameter. `SendMessageUseCase.send` writes the user message with the chat's `updatedAt`, the
binds, the reply and its jobs' outbox rows, or none of them; `DeleteChatUseCase.delete` removes
the attachments' rows and the chat, or neither. The guards above then decide every race inside
Postgres, with no lock in the process: of two sends to one chat the second waits on the first's
writes and its reply insert answers `false` once the first commits, and of two binds of one
attachment the second's `UPDATE` waits on the row and skips it. Two api processes behave as two
fibers. S3 stays outside the transaction: the bytes are kept before the bind, so no bound row sits
over expiring bytes, and deleted before the commit, so a rollback restores rows that a retry still
finds. SQS is reached only through the outbox, whose rows join it.

## Stuck replies

A reply that no attempt settles stays active, so the partial unique index refuses every next send
to its chat with `ChatBusyError` until the worker fails it from the dead-letter queue
([aws.md › Queues](aws.md#queues)). No sweep over active messages exists: by age alone it could
not tell a dead reply from one waiting in a backlog.

## The outbox

A job reaches SQS through the `outbox` table, so it commits or rolls back with the writes that
enqueue it: `apps/api` provides `QueueClientOutbox` as its `QueueClient` and never sends to SQS,
and `apps/worker` consumes through `QueueClientSqs` beside the relay.

- **`QueueClientOutbox`** (`infrastructure/shared/queue.client.ts`) is a `QueueClient` whose
  `send` encodes the job as the SQS client does (`encodeBody`) and inserts a row: the
  definition's `name` as `queue` (the stage is added on the way out), the `jobId` and the body.
  The insert joins the caller's `sql.withTransaction`; outside one it commits alone. Its
  `consume` dies: the api never consumes.
- **`OutboxRelay`** (`infrastructure/outbox/outbox.relay.ts`), a layer the worker provides, polls
  in one transaction: it selects up to 10 rows `ORDER BY created_at, id` `FOR UPDATE SKIP
  LOCKED`, sends each over `QueueTransport` to `buildResourceName(STAGE, queue)` with its
  `jobId`, deletes them and commits. A full batch polls again at once; a shorter one waits
  `OUTBOX_POLL_INTERVAL` (1 second by default).
- **Several relays share the table.** `SKIP LOCKED` hands a row to one relay at a time, and the
  others take the next rows or none.
- **A failed batch rolls back,** so its rows stay: the relay logs `outbox relay failed` with
  the cause and polls again after `OUTBOX_POLL_INTERVAL`. Rows sent before the failure in the
  same batch are sent again, as is a batch whose commit a crash cuts off: delivery is
  at-least-once.

## Migrations

The schema changes only through SQL migrations that drizzle-kit generates from the entity files
and that are committed.

| Command | Does |
|---|---|
| `make migration NAME=<name>` | `drizzle-kit generate` in `infrastructure/`: compares the entity files with the last snapshot and writes `infrastructure/db/migrations/<timestamp>_<name>/` (`migration.sql`, `snapshot.json`); needs no database |
| `make migrate` | applies the pending migrations to `DATABASE_URL` through an Effect program on `DatabaseConfig`; with none pending it logs `nothing to apply`; while the database refuses connections it retries, logging `database not reachable yet, retrying`; any other failed connection or query logs its cause at once |
| `make migration-check` | generates into the folder and fails, printing the missing SQL, if a new folder appeared; it removes that folder |

- **`make migration-check` is soft locally and strict in CI.** In `make check` it counts every
  folder in the tree, committed or not, so a step that adds a migration stays green before its
  commit. CI runs it on a fresh checkout, which holds only committed migrations, so there an
  entity changed without a committed migration fails the build.
- Commit `migration.sql` and `snapshot.json` together, and never edit a committed migration: the
  ledger `drizzle.__drizzle_migrations` records each one once, so an edit never reaches a
  database that already applied it.
- When a column or a table disappears and another appears, drizzle-kit asks whether it was
  renamed. `make migration` asks in the terminal; without one (`make migration-check`, CI) it
  fails and prints the `--hints` it needs, so run `make migration` by hand first.
- The apps neither migrate nor check the schema at startup; only `make migrate` and the tests'
  setup apply migrations.
- Biome skips `infrastructure/db/migrations/`: the files are drizzle-kit's output, and a
  reformatted snapshot would differ from the next one it writes.

## The local database

`make up` creates it as an RDS instance inside MiniStack and writes its `DATABASE_URL` to
`.env.pulumi`: [aws.md › The local stand-in](aws.md#the-local-stand-in).

## Tests

Each test runs on a database of its own, copied from a template that the run's setup migrates
with the `make migrate` program ([tooling.md › Tests](tooling.md#tests)). A repository suite runs
one body over every implementation of its port and provides the layer per test
([effect-tests.md](../../.claude/rules/effect-tests.md)); the facts only Postgres has (a check, a
partial unique index, a transaction) sit in a suite of their own. The service and use case
suites run on the test database too, and a race there runs the rival calls concurrently on the
real repositories, with no fake between them. The suites share the stacks of
every repository from `infrastructure/testing/repository-stacks.ts` and insert the parent rows
with `insertUser` and its siblings from `infrastructure/testing/rows.ts`. The chat and api
harnesses provide `QueueClientOutbox`, so a send's jobs land in the test database's outbox. An
`.entity.test.ts` checks what the schema itself refuses (a check, a partial unique index) and
reads the `SqlError` of a refused statement with `flipSqlError` from
`infrastructure/testing/db-test.ts`.
