import { PgClient } from '@effect/sql-pg'
import { Effect, Layer, Redacted } from 'effect'
import { inject } from 'vitest'
import type { TestProject } from 'vitest/node'

declare module 'vitest' {
  export interface ProvidedContext {
    readonly databaseUrl: string
  }
}

const templateDatabase = 'template'

const buildDatabaseUrl = (url: string, database: string) => {
  const target = new URL(url)
  target.pathname = `/${database}`
  return Redacted.make(target.href)
}

const runAdmin = (url: string, statement: string) =>
  Effect.flatMap(PgClient.PgClient, (client) => client.unsafe(statement)).pipe(
    Effect.provide(PgClient.layer({ url: Redacted.make(url) })),
  )

/**
 * Creates the template database on the server of `adminUrl`, migrates it, marks it a template and
 * hands `adminUrl` to `PgClientTest`: the run-wide half, for vitest's `globalSetup`.
 *
 * `migrate` must close its connections before it returns: `CREATE DATABASE … TEMPLATE` refuses a
 * template that still has a session.
 */
export const setupTemplateDatabase = Effect.fn('setupTemplateDatabase')(function* <E>(
  project: TestProject,
  {
    adminUrl,
    migrate,
  }: {
    readonly adminUrl: string
    readonly migrate: (url: Redacted.Redacted) => Effect.Effect<unknown, E>
  },
) {
  yield* runAdmin(adminUrl, `CREATE DATABASE ${templateDatabase}`)
  yield* migrate(buildDatabaseUrl(adminUrl, templateDatabase))
  yield* runAdmin(adminUrl, `ALTER DATABASE ${templateDatabase} IS_TEMPLATE true`)

  project.provide('databaseUrl', adminUrl)
})

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

    return PgClient.layer({ url: buildDatabaseUrl(adminUrl, database) })
  }),
)
