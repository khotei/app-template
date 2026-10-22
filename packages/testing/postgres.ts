import { PgClient } from '@effect/sql-pg'
import { Effect, Layer, Redacted } from 'effect'
import { inject } from 'vitest'

declare module 'vitest' {
  export interface ProvidedContext {
    /** The run's Postgres container, on a database that is not the template. */
    readonly databaseUrl: string
  }
}

/** The database vitest's `globalSetup` migrates once per run and marks a template. */
export const templateDatabase = 'template'

export const buildDatabaseUrl = (url: string, database: string) => {
  const target = new URL(url)
  target.pathname = `/${database}`
  return Redacted.make(target.href)
}

const runAdmin = (url: string, statement: string) =>
  Effect.flatMap(PgClient.PgClient, (client) => client.unsafe(statement)).pipe(
    Effect.provide(PgClient.layer({ url: Redacted.make(url) })),
  )

/**
 * A `PgClient` on a database of its own, copied from the migrated template and dropped when the
 * layer's scope closes: build it once per test file.
 */
export const PgClientTest = Layer.unwrap(
  Effect.gen(function* () {
    const adminUrl = inject('databaseUrl')
    const database = `test_${crypto.randomUUID().replaceAll('-', '')}`

    yield* Effect.acquireRelease(
      runAdmin(adminUrl, `CREATE DATABASE ${database} TEMPLATE ${templateDatabase}`),
      () => Effect.orDie(runAdmin(adminUrl, `DROP DATABASE ${database} WITH (FORCE)`)),
    )

    return PgClient.layer({ url: buildDatabaseUrl(adminUrl, database) })
  }),
)
