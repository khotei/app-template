import { PgClient } from '@effect/sql-pg'
import { Clock, Effect, Layer, Redacted } from 'effect'
import { inject } from 'vitest'

declare module 'vitest' {
  export interface ProvidedContext {
    readonly databaseUrl: string
  }
}

/** The migrated database the `globalSetup` creates; `PgClientTest` copies it for each test. */
export const templateDatabase = 'template'

const buildDatabaseUrl = (url: string, database: string) => {
  const target = new URL(url)
  target.pathname = `/${database}`
  return Redacted.make(target.href)
}

const runAdmin = (url: string, statement: string) =>
  PgClient.PgClient.use((client) => client.unsafe(statement)).pipe(
    Effect.provide(PgClient.layer({ url: Redacted.make(url) })),
  )

/**
 * `@effect/sql-pg`'s pool reads `Clock` once, when built, and times its connections by it; on a
 * test's `TestClock` a `setTime` far ahead hangs the next statement, so the pool gets the live
 * clock.
 */
const LiveClock = Layer.sync(Clock.Clock, () => Clock.Clock.defaultValue())

/**
 * A `PgClient` on a fresh database copied from the migrated template, dropped when the layer's
 * scope closes: provide it per test, so no test sees another's rows.
 */
export const PgClientTest = Layer.unwrap(
  Effect.gen(function* () {
    const adminUrl = inject('databaseUrl')
    const database = `test_${crypto.randomUUID().replaceAll('-', '')}`

    yield* Effect.acquireRelease(
      runAdmin(adminUrl, `CREATE DATABASE ${database} TEMPLATE ${templateDatabase}`),
      () => Effect.orDie(runAdmin(adminUrl, `DROP DATABASE ${database} WITH (FORCE)`)),
    )

    return PgClient.layer({ url: buildDatabaseUrl(adminUrl, database) }).pipe(
      Layer.provide(LiveClock),
    )
  }),
)
