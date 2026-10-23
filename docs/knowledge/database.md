# Database

How the app stores its records in Postgres: where the tables are declared, how a row becomes a
domain model, how the schema changes, and how tests get a database. The code:
`infrastructure/db/` (the client `Db`, the shared columns, the migrations and the migrate
program), `infrastructure/<aggregate>/<entity>.entity.ts` (the tables) and
`infrastructure/drizzle.config.ts`. Drizzle runs on `@effect/sql-pg` and is reached only through
Effect: every query is an `Effect`, never a promise.

## Schema and entity files

Each entity declares its tables in one file beside its repository,
`infrastructure/<aggregate>/<entity>.entity.ts` (`user/user.entity.ts`: `users`, `credentials`).
The tables are the one declaration of the schema: the migrations are generated from them and the
row codecs derived from them.

- **Names.** A table is declared with `snakeCase.table` from `drizzle-orm/pg-core`, so the
  `camelCase` keys in code (`createdAt`) become `snake_case` columns (`created_at`) with no name
  spelled twice.
- **Shared columns** come from `infrastructure/db/columns.ts`: `id()`, a `uuid` primary key with
  `DEFAULT uuidv7()`, and `createdAt()`, a `timestamptz` column with no default. The domain writes
  every id and every timestamp with its own clock, so `TestClock` holds and there is no second
  clock; the `uuidv7()` default serves only hand-written SQL.
- **Enums and checks read the domain.** An enum takes its values from the domain's literal
  (`pgEnum('credential_kind', [Credential.fields.kind.literal])`), and a check reads the
  constant its brand checks with (`credentials_hash_check` matches `secretHashPattern.source`, as
  `SecretHash` does), so a row written by hand cannot hold what the domain rejects. A changed
  literal or pattern changes the schema, and `make migration-check` fails until a migration
  exists.

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
- A repository decodes a row and builds the model from the fields (`new User(fields)`), and
  encodes the model to the row it inserts. A row whose values are already the domain's (brands,
  literals) is written as is: `credentials` takes `{ hash, kind, userId }` from the credential
  and the user, with no codec.

## Repositories

A Postgres adapter is a `Layer` over `Db` and `SqlClient`, beside the key-value one in the same
`.repository.ts` (names: [naming.md › Symbols](../../.claude/rules/naming.md#symbols)). A method
that writes several tables runs them in one `sql.withTransaction`, passed to `Effect.fn` as a
pipeable: `UserRepositoryPg.insert` writes the user and its credential, or neither. `SqlClient`
is the `PgClient` that `Db.layerFromConfig` and `DbTest` publish, so the transaction runs on the
connection `Db` uses. Every method ends with `orDieWithSqlError` from `db.client.ts`.

## Migrations

The schema changes only through SQL migrations that drizzle-kit generates from the entity files
and that are committed.

| Command | Does |
|---|---|
| `make migration NAME=<name>` | `drizzle-kit generate` in `infrastructure/`: compares the entity files with the last snapshot and writes `infrastructure/db/migrations/<timestamp>_<name>/` (`migration.sql`, `snapshot.json`); needs no database |
| `make migrate` | applies the pending migrations to `DATABASE_URL` through an Effect program on `DatabaseConfig`; with none pending it logs `nothing to apply`; a failed connection or query logs its cause |
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

## Tests

Each test runs on a database of its own, copied from a template that the run's setup migrates
with the `make migrate` program ([tooling.md › Tests](tooling.md#tests)). A repository suite runs
one body over every implementation of its port and provides the layer per test
([effect-tests.md](../../.claude/rules/effect-tests.md)); the facts only Postgres has (a check, a
missing default, a transaction) sit in a suite of their own.
