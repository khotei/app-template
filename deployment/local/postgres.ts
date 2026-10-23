import { fileURLToPath } from 'node:url'

import * as docker from '@pulumi/docker'
import { Effect, Redacted } from 'effect'

import { projectName } from '@app-template/aws'
import { DatabaseConfig, postgresImage } from '@app-template/config'

const internalPort = 5432
/**
 * Every setting comes from `DATABASE_URL`, and the container is named after its port, so a
 * worktree's database runs beside the main tree's without sharing a port, a name or its data.
 */
const { url } = Effect.runSync(Effect.provide(DatabaseConfig, DatabaseConfig.layer))
const databaseUrl = new URL(Redacted.value(url))
const port = Number(databaseUrl.port)
const user = decodeURIComponent(databaseUrl.username)
const database = databaseUrl.pathname.slice(1)
const dataDir = fileURLToPath(new URL('../../.data/postgres', import.meta.url))

const remoteImage = new docker.RemoteImage('postgres-image', {
  name: postgresImage,
  keepLocally: true,
})

new docker.Container(
  'postgres',
  {
    name: `${projectName}-postgres-${port}`,
    image: remoteImage.imageId,
    ports: [{ internal: internalPort, external: port }],
    envs: [
      `POSTGRES_USER=${user}`,
      `POSTGRES_PASSWORD=${decodeURIComponent(databaseUrl.password)}`,
      `POSTGRES_DB=${database}`,
    ],
    // Postgres 18 keeps its data under a major-version folder of /var/lib/postgresql.
    volumes: [{ hostPath: dataDir, containerPath: '/var/lib/postgresql' }],
    healthcheck: {
      // Over TCP: the server the image runs while it initialises listens on the socket only.
      tests: ['CMD', 'pg_isready', '-h', '127.0.0.1', '-U', user, '-d', database],
      interval: '1s',
      timeout: '3s',
      retries: 30,
      startPeriod: '1s',
    },
    wait: true,
    waitTimeout: 60,
    destroyGraceSeconds: 15,
    stopTimeout: 15,
  },
  {
    // A new port renames the container; the old one holds the data folder until it is deleted.
    deleteBeforeReplace: true,
  },
)
