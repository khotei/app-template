import { PgClient } from '@effect/sql-pg'
import { PostgreSqlContainer } from '@testcontainers/postgresql'
import { Effect, Layer, Redacted } from 'effect'
import { GenericContainer, type StartedTestContainer, Wait } from 'testcontainers'
import type { TestProject } from 'vitest/node'

import { ministackImage, postgresImage } from '@app-template/config'
import { ministackRegion, templateDatabase } from '@app-template/testing'

import { Db } from '#infrastructure/db/db.client'
import { migrateDatabase } from '#infrastructure/db/migrate'

const startPostgresWithTemplate = async () => {
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
  return container
}

const ministackPort = 4566

const startMiniStack = () =>
  new GenericContainer(ministackImage)
    .withExposedPorts(ministackPort)
    .withEnvironment({ MINISTACK_REGION: ministackRegion })
    .withWaitStrategy(Wait.forHttp('/_ministack/health', ministackPort))
    .start()

const buildEndpoint = (container: StartedTestContainer) =>
  new URL(`http://${container.getHost()}:${container.getMappedPort(ministackPort)}`).href

/**
 * One Postgres and one MiniStack per e2e run: a migrated template each test copies, an endpoint
 * each test provisions its own stage on.
 */
export default async function setup(project: TestProject) {
  const [postgres, ministack] = await Promise.all([startPostgresWithTemplate(), startMiniStack()])
  project.provide('databaseUrl', postgres.getConnectionUri())
  project.provide('awsEndpoint', buildEndpoint(ministack))

  return async () => {
    await Promise.all([postgres.stop(), ministack.stop()])
  }
}
