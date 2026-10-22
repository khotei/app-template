import { PgClient } from '@effect/sql-pg'
import { PostgreSqlContainer } from '@testcontainers/postgresql'
import { Effect, Layer, Redacted } from 'effect'
import type { TestProject } from 'vitest/node'

import { postgresImage } from '@app-template/config'
import { buildDatabaseUrl, templateDatabase } from '@app-template/testing'

import { Db } from '#infrastructure/db/db.client'
import { migrateDatabase } from '#infrastructure/db/migrate'

const prepareTemplate = Effect.fn('prepareTemplate')(function* (adminUrl: string) {
  const admin = yield* PgClient.PgClient
  const DbOnTemplate = Db.layer.pipe(
    Layer.provide(PgClient.layer({ url: buildDatabaseUrl(adminUrl, templateDatabase) })),
  )

  yield* admin.unsafe(`CREATE DATABASE ${templateDatabase}`)
  // The template's pool closes as the migration returns: `CREATE DATABASE … TEMPLATE` refuses a
  // template that still has a session.
  yield* migrateDatabase.pipe(Effect.provide(DbOnTemplate))
  yield* admin.unsafe(`ALTER DATABASE ${templateDatabase} IS_TEMPLATE true`)
})

/** One Postgres container per `make test` run, with a migrated template each test file copies. */
export default async function setup(project: TestProject) {
  const container = await new PostgreSqlContainer(postgresImage).start()
  const adminUrl = container.getConnectionUri()

  await prepareTemplate(adminUrl).pipe(
    Effect.provide(PgClient.layer({ url: Redacted.make(adminUrl) })),
    Effect.runPromise,
  )
  project.provide('databaseUrl', adminUrl)

  return async () => {
    await container.stop()
  }
}
