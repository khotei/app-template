import { BunCrypto } from '@effect/platform-bun'
import { PgClient } from '@effect/sql-pg'
import { ConfigProvider, Effect, Layer, Redacted } from 'effect'
import { FetchHttpClient } from 'effect/http'

import { ApiLayer } from '@app-template/api/layer'
import { AwsConfig } from '@app-template/config'
import { ApiClient } from '@app-template/http-api'
import { AttachmentBucketS3, S3BucketFromConfig } from '@app-template/infrastructure/attachment'
import { AwsTest } from '@app-template/infrastructure/testing'
import { layerCookieJarTest, PgClientTest } from '@app-template/testing'
import { WorkerLayer } from '@app-template/worker/layer'

// `Config.Port` refuses 0, so the api cannot take an ephemeral port itself.
const findFreePort = Effect.sync(() => {
  const probe = Bun.listen({ hostname: 'localhost', port: 0, socket: { data() {} } })
  const { port } = probe
  probe.stop(true)
  return port
})

/** The processes' environment: the test's database and stage, the rest as `.env.example` has it. */
const buildConfigProvider = Effect.fnUntraced(function* (port: number) {
  const { config } = yield* PgClient.PgClient
  const { region, endpoint, stage } = yield* AwsConfig
  const databaseUrl = yield* Effect.fromNullishOr(config.url)
  const awsEndpoint = yield* Effect.fromOption(endpoint)

  return ConfigProvider.fromUnknown({
    DATABASE_URL: Redacted.value(databaseUrl),
    AWS_REGION: region,
    AWS_ENDPOINT_URL: awsEndpoint.href,
    STAGE: stage,
    API_PORT: port,
    NODE_ENV: 'test',
    LOG_LEVEL: 'Warn',
    QUEUE_LOCK_EXPIRATION: '15 seconds',
    QUEUE_LOCK_REFRESH_INTERVAL: '5 seconds',
    OUTBOX_POLL_INTERVAL: '100 millis',
  })
})

/** One browser: a cookie jar of its own. */
const layerApiClient = (port: number) =>
  ApiClient.layer(`http://localhost:${port}`).pipe(
    Layer.provide(layerCookieJarTest()),
    Layer.provide(FetchHttpClient.layer),
  )

const Apps = Layer.merge(ApiLayer, WorkerLayer).pipe(Layer.provide(BunCrypto.layer))

/**
 * The api and the worker in one runtime over the test's database and stage, the model stubbed,
 * with an `ApiClient` on the api; `SqlClient` and `AttachmentBucket` stay in context for what the
 * test reads behind the apps.
 *
 * `PgClientTest`, not `DbTest`: a layer is built once per runtime, so `DbTest`'s `Db.layer` would
 * also serve the apps, bound to the test's client while their `Transaction` holds their own, and
 * every write would commit outside the transaction.
 */
export const StandTest = Layer.unwrap(
  Effect.gen(function* () {
    const port = yield* findFreePort
    const provider = yield* buildConfigProvider(port)
    return Layer.merge(Apps, layerApiClient(port)).pipe(
      Layer.provide(ConfigProvider.layer(provider)),
    )
  }).pipe(Effect.orDie),
).pipe(
  Layer.provideMerge(Layer.provide(AttachmentBucketS3, S3BucketFromConfig)),
  Layer.provideMerge([PgClientTest, AwsTest]),
)
