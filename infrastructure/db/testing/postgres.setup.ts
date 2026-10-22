import { PgClient } from '@effect/sql-pg'
import { PostgreSqlContainer } from '@testcontainers/postgresql'
import { Effect, Layer, type Redacted } from 'effect'
import type { TestProject } from 'vitest/node'

import { postgresImage } from '@app-template/config'
import { prepareTemplateDatabase } from '@app-template/testing'

import { Db } from '#infrastructure/db/db.client'
import { migrateDatabase } from '#infrastructure/db/migrate'

const migrateTemplate = (url: Redacted.Redacted) =>
  migrateDatabase.pipe(Effect.provide(Db.layer.pipe(Layer.provide(PgClient.layer({ url })))))

/** One Postgres container per `make test` run, with a migrated template each test copies. */
export default async function setup(project: TestProject) {
  const container = await new PostgreSqlContainer(postgresImage).start()

  await prepareTemplateDatabase(project, {
    adminUrl: container.getConnectionUri(),
    migrate: migrateTemplate,
  }).pipe(
    Effect.onError(() => Effect.promise(() => container.stop())),
    Effect.runPromise,
  )

  return async () => {
    await container.stop()
  }
}
