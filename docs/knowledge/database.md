# Database

How the app stores its records in Postgres: where the tables are declared, how a row becomes a
domain model, how the schema changes, and how tests get a database. The code:
`@app-template/packages/db`, which knows no table (the client factory `createDb`, `Transaction`,
the shared columns and the query helpers); the kernel's `postgres` part (`PgClientFromConfig`
and the migrate program); the data layer, `kernel/data/` (the client `Db`, made by
`createDb(relations)` over the `PgClient` in the context, the tables, their entities, the
migrations and the repositories over them); and a module's models, each the codec of its own
row. Drizzle runs on `@effect/sql-pg` and is reached only through Effect: every query is an
`Effect`, never a promise.

## Schema and entity files

The data layer, `kernel/data/<store>/`, declares each table in `<name>.table.ts`, with its
columns' schema `<Name>Columns` (`createSelectSchema(<table>)`) where a neighbour's entity nests
it, and its entities, the schemas read from it, in `<name>.entity.ts`; what each may import:
[kernel/CLAUDE.md](../../kernel/CLAUDE.md).
The tables form a DAG and import no entity, so an entity nests a neighbour's `<Name>Columns`
from the table file without a cycle: `RunEntity` nests `MessageColumns`, and
`ChatEntity` and `MessageEntity` nest `RunColumns`, where the entities would import each other.
The tables are the one declaration of the schema: the migrations are generated from them and
the entities derived from them.

- **Names.** A table is declared with `snakeCase.table` from `drizzle-orm/pg-core`, so the
  `camelCase` keys in code (`createdAt`) become `snake_case` columns (`created_at`) with no name
  spelled twice.
- **Shared columns** come from `@app-template/packages/db`: `id()`, a `uuid` primary key with
  `DEFAULT uuidv7()`, and `createdAt()` and `updatedAt()`, `timestamptz` columns with no default
  and no `$onUpdate`. The domain writes every id and every timestamp with its own clock, so
  `TestClock` holds and there is no second clock; the `uuidv7()` default serves only
  hand-written SQL, and needs Postgres 18 or later.
- **Enums and checks state the data layer's own values.** An enum takes its values from a tuple
  the table exports (`runStatuses = ['queued', …] as const`, then
  `pgEnum('run_status', runStatuses)`), and a check declares its own pattern or limit
  beside the table (`credentials_hash_check` the pattern `SecretHash` checks with;
  `attachments_media_type_check` the one `MediaType` checks with, matched with `~*` for its `i`
  flag; `chats_title_check` the length `ChatTitle` caps), so a row written by hand cannot hold
  what the domain rejects. A model that holds the value imports it from the table and checks the
  same rule on its side, so a change to the value changes both. drizzle-kit inlines the values
  into the DDL, so a changed literal, pattern or limit changes the schema, and
  `make migration-check` fails until a migration exists.
- **A check is a backstop, never stricter than the brand.** It may let through what the brand
  refuses, never the reverse: `chats_title_check` trims spaces only and counts code points, where
  `ChatTitle` trims every whitespace and counts UTF-16 units. Checks are named
  `<table>_<column>_check`, indexes `<table>_<columns>_index` and partial indexes
  `<table>_<columns>_<predicate>_index` (`runs_chat_id_active_index`).
- **A rule across rows is a partial unique index.** `runs_chat_id_active_index` allows one
  active Run per chat; its predicate reads the active statuses from `activeRunStatuses`, exported
  from `run.table.ts` beside the table.
- **A descending index states its null order.** Drizzle's `desc()` indexes nulls last while
  Postgres's `ORDER BY … DESC` sorts them first, so an index for that order is
  `.desc().nullsFirst()` (`chats_user_id_created_at_index`).
- **Foreign keys say what a delete does.** `credentials`, `messages` and a chat's attachments
  cascade from their parent, so a chat's delete is one statement. An attachment names its chat in
  `chat_id`, a key to `chats` that cascades, so one uploaded into a chat and never sent goes with
  it. A sent one names its message too, by the pair `(message_id, chat_id)` over
  `messages (id, chat_id)`, so the message can only be one of that chat; the pair key skips a
  row with a null in it, so a check refuses a message without a chat. The cascade never reaches
  S3: whoever deletes a chat or a message deletes the bytes too. `source_id`, the attachment a
  row was sent from, does not cascade (`attachments_source_id_fk`): a delete of an attachment
  that a row still names fails the statement, and a check lets only a bound row name a source.
- **A link lives in one foreign key, never in an array beside it.** Postgres cannot hold a
  foreign key on array elements, so a copy would drift: a message's attachments are the rows
  whose `attachments.message_id` names it, and `messages` keeps no list of them. They read in
  upload order, `created_at` then `id`, whatever order the send listed them in;
  `attachments_message_id_created_at_id_index` serves that order.

## Entities and models

An entity file lays its entity over the table's columns, in the data layer's own types
(`string`, `string | null`, `Date`), beside the `<Name>EntityWhere` and `<Name>EntitySet` its
reads and writes filter and change by. A repository's `insert` takes the table's full row, its
`<Name>Columns` (the entity itself where it nests nothing), so a row that leaves a column out
fails typecheck. An entity is the shape every read returns, one level deep: a chat's and a
message's nest their attachments and their Run's columns, a Run's its messages' columns, and
the nested columns nest nothing:

```ts
export const ChatEntity = Schema.Struct({
  ...ChatColumns.fields,
  attachments: Schema.Array(AttachmentEntity),
  run: Schema.NullOr(RunColumns),
})
```

Where a read's shape is not the entity's, the entity file holds the function from the one to the
other: a message's Run comes from two relations, the newest that answers a user's message and
the one that wrote an assistant's, so `buildMessageEntity` keeps the one its author has and the
repository maps every read through it.

A model is the codec of its own row: it declares each stored value as its row holds it, a
nullable column as `Schema.OptionFromNullOr(…)` and a timestamp as `Schema.DateTimeUtcFromDate`,
so its encoded side is its entity and its type side is what the rules read. No mapper sits
between them: a service codes a row with `encodeRowWith` and `decodeRowWith` from
`@app-template/packages/db`, given the model. A read decodes the entity with the model in the
read's shape, whose nested models decode their own rows, and a write encodes the model's own
fields, its `<Model>Fields`, since a write holds no nested record:

```ts
const row = yield* encodeRowWith(ChatFields)(chat)
const found = yield* chats.selectOne(where).pipe(Effect.flatMap(decodeRowWith(Schema.Option(Chat))))
```

- A model's encoded side is the row of its one store. A second stored form of a model brings
  back a mapper of its own, which lays the model's schemas over that store's columns.
- A service writes a model encoded through `encodeRowWith` into the row the repository's `insert`
  takes, the table's full row, so a column the model lacks fails typecheck at that insert; a
  read drops it. A value already in the data layer's types (brands, literals) is passed as is:
  `UserRepository.insert` takes the credential with no codec and writes
  `{ hash, kind, userId }`, the user's id from the row it inserted.
- A `jsonb` column carries its shape's type (`jsonb().$type<typeof RunFailureJson.Type>()`),
  declared as a schema beside the table, so the row Drizzle returns fits the entity.

## Relations

The data layer declares the relations once, with `defineRelations` over every table, and `Db` is
built with them (`PgDrizzle.make({ relations })`), so `db.query.<table>` is typed. A relation
names its columns (`from`, `to`) and joins on their equality only, and holds no order: a query
states it with `orderBy`. A relational query returns nested rows typed as the entity, so a
repository answers them as they are:

```ts
const rows = yield* db.query.messages.findMany({
  with: { attachments: { orderBy: { createdAt: 'asc', id: 'asc' } } },
})
// rows: [{ id, chatId, …, attachments: [{ id, userId, messageId, … }] }]
```

A repository whose entity nests a relation reads the entity `with` the top-level relations it nests,
in one relational query, and never a nested `with`: `Chat.attachments`, `Chat.run`,
`Run.userMessage` and `Message.run` are model fields another table holds, read and never written by
their own writes. A `one` relation over many rows (a chat's Runs) is ordered by the read, `{ run: {
orderBy: newestFirst } }`, since a relation holds no order and renders `limit 1`. A relational query
aliases its table, so the chat's `where` is built on the table the query hands to `RAW`, never on
the `chats` constant.

## Repositories

A repository is a `Layer` over `Db` and `SqlClient` in its entity's `.repository.ts` (names:
[naming.md › Symbols](../../.claude/rules/naming.md#symbols)). The data layer's, in
`kernel/data/<store>/`, `FileRepository` over the attachments' objects among them
([aws.md › Attachments](aws.md#attachments)), speak entities: they take a table's row (an
object store a `<Name>EntityInsert`), a `<Name>EntitySet` and a `<Name>EntityWhere` and answer
`<Name>Entity`. A module's service calls one directly, with no port in front, and codes its rows
through its models (`UserService` over `UserRepository`). A method that writes several tables
runs them in one `sql.withTransaction`, passed to `Effect.fn` as a pipeable:
`UserRepository.insert` writes the user and its credential, or neither. `SqlClient` is the
`PgClient` that `Db.layer` takes from the context (`PgClientFromConfig` in the processes, `DbTest`
in the e2e), so the transaction runs on the connection `Db` uses. Every method ends with
`orDieWithSqlError` from `@app-template/packages/db`.

A module's services call the data layer's repositories with the models as
their codecs: a write encodes the model into the row, the set takes its fields from that row, the
service maps each `Option` of a `where` to `null`, and a read decodes the entities into models; a
mapping failure dies.

A read that nests a relation or filters on one is a relational query (`db.query.<table>.findFirst`
and `findMany`); a read of one table with neither goes through the core builder
(`db.select().from(<table>)`, as `AttachmentRepository` reads), and so do the writes
(`db.insert`, `db.update`, `db.delete`). A relational read of at most one row is a `findFirst`,
which emits the `limit 1` itself, even where a key makes the row unique, so the query states its
intent; the row it finds is the entity as Drizzle types it, answered with no decode, and
`Option.fromUndefinedOr` turns the `undefined` of none into `Option.none()`. A core-builder read
of one row takes the head of its many (`Arr.head`). A filter on a relation (`{ credentials: {
kind, hash } }`) renders as `exists (…)`.

A write of some fields under a condition takes a `<Name>EntitySet` and a `<Name>EntityWhere`.
The entity file lists the columns an update may write once, as `<name>SetColumns`, typed by the
table's columns (`satisfies ReadonlyArray<keyof <Name>Columns>`), so a name that is no column
fails typecheck on the tuple, and derives the `Set` type from it over the same columns; the
repository writes `Struct.pick(set, <name>SetColumns)`, so a whole entity passed as a set writes
only those columns, and an `undefined` field is skipped by Drizzle's `set`.
`buildWhere<Fields>(columns)` from `@app-template/packages/db` takes a `WhereColumns<Fields>`,
one mapper per field answering `SQL | undefined`, and joins them with `and`, which skips an
absent field (`UndefinedOr.map`); a mapper answering the wrong shape and a field the type gains
without a mapper fail typecheck.
A nullable field's mapper is `eqOrIsNull(column)`, which renders `null` as `IS NULL`, since
SQL's `=` never matches it.

## Guards

A rule that two writers could break between a read and a write is held by the database, in the
statement that writes. The caller checks the rule first, so a write the guard refuses only lost
a race: every repository's `insert`, `update` and `delete` dies when Postgres refuses it or it
touches no row:

- **Insert under a partial unique index.** `RunRepository.insert` is a plain insert, so a second
  active Run in a chat fails on the index and dies. `createUserMessage` reads the chat with its
  newest Run and refuses a chat whose Run is active (`ensureChatNotBusy`, `ChatBusyError`, 409);
  of two sends that both read none at once, the second's Run insert, its last write, dies on the
  index, rolled back whole with its message and binds: a lost race of that narrow window answers
  500.
- **Update under a `where`.** `RunRepository.update(set, where)` writes the Run's status, failure
  and `updatedAt` `WHERE id = … AND status IN (…)`: `RunService.move` passes the encoded Run as
  the set, and its id and the stored status to match as the `RunEntityWhere`, so a write whose
  expected status another worker has left, or whose Run is gone, changes nothing and dies; the use
  case then reads the Run and skips it as settled or deleted. A Run's completion writes the
  assistant's message, then moves the Run to `done` naming it, in one transaction, so a lost race
  keeps no reply.
- **A message is never changed.** `MessageRepository` has no `update`: a user's message is
  finished when sent, an assistant's when its Run writes it. The Run names its reply:
  `runs_assistant_message_id_check` holds that a Run names one exactly when it is `done`, and
  `runs_assistant_message_id_unique` that a reply belongs to one Run. The key sits on `runs`, so
  `messages` names no Run and the two tables never import each other.
- **A count per owner.** A limit on how many rows an owner holds fits no guard here: an insert
  that writes only while the owner's count is under the limit, even as one statement, lets two
  concurrent creates both count one under it and both insert. Such a create checks the count
  first and accepts the overshoot, one row per concurrent create; the `FOR UPDATE` read that
  would close it is rejected in
  [decisions.md › Guards in the write, no lock](decisions.md#guards-in-the-write-no-lock).
- **Update of some fields under a `where`.** A service reads by the caller's `where` to name the
  refusal, then writes only the changed fields under the same `where`, so a row another writer
  changed in between is missed and the write dies. A repository's `update(set, where)` takes a
  set that is `RequireAtLeastOne` from `type-fest`, so an empty write fails typecheck, and a
  `where` of a key and optionally a field the row must still hold, mapped through `buildWhere`
  (above). The worked case is a chat's rename: the title job renames `where` `title` is still
  `none`, so a rename landing between its read and its write wins, and the title job dies and
  fails.
- **A row of its own, not a shared one.** A send binds a library attachment by inserting the
  chat's record of it, a row bound to the message that names the attachment in `source_id`, and
  never writes the library attachment's row, so two sends of one attachment never meet on a row.
  A delete of the attachment between a send's read and its insert fails the insert on
  `attachments_source_id_fk`, and the send dies (500), rolled back whole.

`ChatRepository.delete(where)` is one statement: the chat's messages, attachments and Runs go by
the cascade. The use case `deleteChat` then deletes the bytes through
`FileAttachmentService.deleteBytes`, after the row, with no transaction. A file a concurrent send
binds between `ChatService.delete`'s read and the delete loses its row with the chat while its
bytes stay in S3.

## Transactions

A use case that writes several aggregates commits them together: `Transaction.run` is a pipeable of
the `Effect.fn` that holds the writes (`Transaction.layer` wraps `SqlClient.withTransaction`), and
every repository call inside joins the transaction through the connection `@effect/sql` keeps in the
fiber's context, so no repository takes a transaction parameter. The guards above decide every
race inside Postgres, with no lock in the process, and two api processes behave as two fibers. S3
stays outside the transaction: the bytes are kept before the row that binds them and deleted once
the rows are gone, so no row names bytes that are gone; a failure between the two leaves only
bytes no row names. SQS joins none either: the sends follow the
commit ([The sends](#the-sends)).

## Stuck Runs

A Run that no worker settles stays active and its chat `queued`, so every next send to the chat
fails `ChatBusyError`. A worker that dies (a killed process, the function's timeout) is settled by
the next delivery, up to the queue's visibility timeout later, which finds the Run started, and
fails it; a store failing the `failed` write, a process that dies or a client that aborts between
the commit and the send, or a job whose every delivery dies, leaves it so, and nothing consumes
the dead-letter queue ([aws.md › Queues](aws.md#queues)). No sweep over active Runs exists: by
age alone it could not tell a dead Run from one waiting in a backlog.

## The sends

A job is a message on its queue, and no table holds it: the record of its work (the Run, the
chat's title) is the one the worker reads
([decisions.md › Jobs as queue messages](decisions.md#jobs-as-queue-messages)).

- **`QueueSender.send(definition, message)`** (`packages/queue`) encodes the message through the
  definition's schema to a JSON string and sends it to the definition's queue;
  `QueueSenderOfStage` in `kernel/aws` names that queue for the stage. A use case sends its jobs
  after its transaction commits, so a delivery always finds the record it names. A transaction
  that fails keeps no row and answers `500`.
- **A send SQS refuses** is logged with the job's id and its chat's. The reply's sender beside
  the use cases also fails its Run with `ReplyFailed` and answers `503 RunNotQueuedError`, the
  message stored and shown failed with its retry; the title's sender only logs it. A send that
  never happens after the commit: [Stuck Runs](#stuck-runs).

## Migrations

The schema changes only through SQL migrations that drizzle-kit generates from the table files
and that are committed. drizzle-kit's own guide to the folder, its snapshots, branches and errors,
at the pinned version: `repos/drizzle/drizzle-kit/skills/drizzle/migrations.md`.

| Command | Does |
|---|---|
| `make migration NAME=<name>` | `drizzle-kit generate --config kernel/data/drizzle.config.ts` from the root, whose paths it resolves against the working directory: compares the table files with the last snapshot and writes `kernel/data/migrations/<timestamp>_<name>/` (`migration.sql`, `snapshot.json`); needs no database |
| `make migrate` | applies the pending migrations to `DATABASE_URL` through `migrateDatabase(folder)`; with none pending it logs `nothing to apply`; while the database refuses connections it retries, logging `database not reachable yet, retrying`; any other failed connection or query logs its cause at once |
| `make migration-check` | drizzle-kit's dry run (`generate --explain`): fails when the table files differ from the migrations, printing the missing SQL and how to regenerate `init`; it writes nothing |

- **`make migration-check` is soft locally and strict in CI.** In `make check` it counts every
  folder in the tree, committed or not, so a step that adds a migration stays green before its
  commit. CI runs it on a fresh checkout, which holds only committed migrations, so there an
  table changed without a committed migration fails the build.
- Commit `migration.sql` and `snapshot.json` together. The ledger `drizzle.__drizzle_migrations`
  records each migration once, so an edit never reaches a database that already applied it.
- **Until a deployed database holds data, the migrations stay one `init`, whose `migration.sql`
  reads as the whole schema in one file.** Every change to a table deletes
  `kernel/data/migrations/` and regenerates it with `make migration NAME=init`, never a second
  migration, a rename by `--hints` or hand-written SQL; a local database then rebuilds by
  `make reset && make up`. Two branches that both regenerated it merge as two folders, which
  `make migration-check` refuses: regenerate once more. The first deployed database ends this:
  from then on a committed migration is never edited.
- The apps neither migrate nor check the schema at startup; only `make migrate` and the tests'
  setup apply migrations.
- Biome skips `kernel/data/migrations/`: the files are drizzle-kit's output, and a
  reformatted snapshot would differ from the next one it writes.

## The local database

`make up` creates it as an RDS instance inside MiniStack and writes its `DATABASE_URL` to
`.env.pulumi`: [aws.md › The local stand-in](aws.md#the-local-stand-in).

## Tests

A repository's e2e runs on `DbTest`, in entities, its parent rows written through `Db`. An entity's
e2e checks, in entities only, what the schema itself refuses (a check, a foreign key, a partial
unique index) and reads the `SqlError` of a refused statement with `flipSqlError`. Each
[guard](#guards) the database adds, the cascades of its [foreign keys](#schema-and-entity-files)
included, has its case in a repository suite: a unit test mocks the repository, so it sees none
([effect-tests.md › Unit and e2e](../../.claude/rules/effect-tests.md#unit-and-e2e)). Where each
suite and its support live and the e2e of a use case's transaction:
[tooling.md › Tests](tooling.md#tests).
