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
  `DEFAULT uuidv7()`, and `createdAt()` and `updatedAt()`, `timestamptz` columns with no default.
  The domain writes every id and every timestamp, with its own clock, so `TestClock` holds and no
  second clock exists; the `uuidv7()` default serves only hand-written SQL. The helpers are
  functions because a table names a column builder the first time it sees it: one builder object
  shared by two tables under different keys would keep the first name.
- **Enums and checks read the domain.** An enum takes its values from the domain's literal
  (`pgEnum('credential_kind', [Credential.fields.kind.literal])`), so a new literal changes the
  enum and the check below fails until a migration exists. A check restates a brand's rule in
  SQL (`credentials.hash` is 64 lower-case hex characters, as `SecretHash`), so a row written by
  hand cannot hold what the brand rejects.

## Codecs

Each entity file derives its row codecs with `createSelectSchema` and `createInsertSchema` from
`drizzle-orm/effect-schema`, refined with the domain's schemas wherever a column carries a domain
type:

```ts
const userFields = { id: UserId, createdAt: Schema.DateTimeUtcFromDate }
export const UserRow = createSelectSchema(users, userFields)
export const UserInsert = createInsertSchema(users, userFields)
```

- A refinement given as a schema replaces the column's schema whole: nothing adds `NullOr` or
  makes it optional, so a nullable column is refined to `Schema.OptionFromNullOr(…)` and a column
  with a default becomes required, as the domain always writes it.
- A repository decodes a row and builds the model from the fields (`new User(fields)`), and
  encodes the model to the row it inserts. There is no mapping function to keep in step with the
  table.
- The ports declare no error channel, so a repository turns a `SqlError` and a row that no
  longer decodes into a defect (`Effect.orDie` as the last pipeable of each method).

## Repositories

A Postgres adapter is `<Entity>RepositoryPg`, a `Layer` constant over `Db` and `SqlClient`,
beside the key-value `<Entity>RepositoryKv` in the same `.repository.ts`; `<Entity>Pg` in the
aggregate's `index.ts` bundles them, as `<Entity>Kv` does. A method that writes several tables
runs them in one `sql.withTransaction`, passed to `Effect.fn` as a pipeable:
`UserRepositoryPg.insert` writes the user and its credential, or neither. `SqlClient` is the
`PgClient` that `Db.layerFromConfig` and `DbTest` publish, so the transaction runs on the
connection `Db` uses.

## Migrations

The schema changes only through SQL migrations that drizzle-kit generates from the entity files
and that are committed.

| Command | Does |
|---|---|
| `make migration NAME=<name>` | `drizzle-kit generate` from `infrastructure/`: compares the entity files with the last snapshot and writes `infrastructure/db/migrations/<timestamp>_<name>/` (`migration.sql`, `snapshot.json`); needs no database |
| `make migrate` | applies the pending migrations to `DATABASE_URL` through an Effect program on `DatabaseConfig`; with none pending it logs `nothing to apply` |
| `make migration-check` | part of `make check`: generates into the folder and fails, printing the missing SQL, if a new folder appeared; it removes that folder |

- Commit `migration.sql` and `snapshot.json` together, and never edit a committed migration: the
  ledger `drizzle.__drizzle_migrations` records each one once, so an edit never reaches a
  database that already applied it.
- When a column or a table disappears and another appears, drizzle-kit asks whether it was
  renamed. `make migration` asks in the terminal; without one (`make migration-check`, CI) it
  fails and prints the `--hints` it needs, so run `make migration` by hand first.
- `drizzle.config.ts` holds no credentials: generating needs no database, and only `make migrate`
  reads `DATABASE_URL`, through `@app-template/config`. The apps neither migrate nor check the
  schema at startup.
- Biome skips `infrastructure/db/migrations/`: the files are drizzle-kit's output, and a
  reformatted snapshot would differ from the next one it writes.

## Tests

`make test` starts one Postgres container per run and migrates a template database with the same
program `make migrate` runs; each test copies it into a database of its own, dropped when the
test ends ([tooling.md › Tests](tooling.md#tests)). A repository suite runs over every
implementation of its port: `describe.each` over the layers, each test providing its own
(`UserRepositoryPg.pipe(Layer.provide(DbTest))`), with the facts only Postgres has (a check, a
missing default, a transaction) in a suite of their own.
