import { PgClient } from '@effect/sql-pg'
import { PostgreSqlContainer } from '@testcontainers/postgresql'
import { Effect, Layer, Redacted } from 'effect'
import type { TestProject } from 'vitest/node'

import { postgresImage } from '@app-template/config'
import { templateDatabase } from '@app-template/testing'

import { Db } from '#infrastructure/db/db.client'
import { migrateDatabase } from '#infrastructure/db/migrate'

/** One Postgres container per `make test` run, with a migrated template each test copies. */
export default async function setup(project: TestProject) {
  const container = await new PostgreSqlContainer(postgresImage).start()
  const onDatabase = (database: string) =>
    PgClient.layer({
      host: container.getHost(),
      port: container.getPort(),
      username: container.getUsername(),
      password: Redacted.make(container.getPassword()),
      database,
    })

  const createTemplate = Effect.gen(function* () {
    const admin = yield* PgClient.PgClient

    yield* admin.unsafe(`CREATE DATABASE ${templateDatabase}`)
    // The provide closes the migration's pool here: `CREATE DATABASE … TEMPLATE` refuses a
    // template that still has a session.
    yield* migrateDatabase.pipe(
      Effect.provide(Db.layer.pipe(Layer.provide(onDatabase(templateDatabase)))),
    )
    yield* admin.unsafe(`ALTER DATABASE ${templateDatabase} IS_TEMPLATE true`)
  }).pipe(Effect.provide(onDatabase(container.getDatabase())))

  await createTemplate.pipe(
    Effect.onError(() => Effect.promise(() => container.stop())),
    Effect.runPromise,
  )
  project.provide('databaseUrl', container.getConnectionUri())

  return async () => {
    await container.stop()
  }
}
