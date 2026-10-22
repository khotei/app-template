import { assert, describe, it } from '@effect/vitest'
import {
  type Config,
  ConfigProvider,
  Duration,
  Effect,
  Layer,
  Option,
  Redacted,
  References,
} from 'effect'

import {
  ApiConfig,
  AwsConfig,
  DatabaseConfig,
  MinimumLogLevelFromConfig,
  QueueConfig,
  RuntimeConfig,
  StoreConfig,
} from '#config/config'

const provideVariables = <A, E>(layer: Layer.Layer<A, E>, variables: Record<string, string>) =>
  layer.pipe(Layer.provide(ConfigProvider.layer(ConfigProvider.fromUnknown(variables))))

describe('config layers', () => {
  it.effect.each<{
    variable: string
    layer: Layer.Layer<never, Config.ConfigError>
    given?: Record<string, string>
  }>([
    { variable: 'API_PORT', layer: ApiConfig.layer },
    { variable: 'STORE_PATH', layer: StoreConfig.layer },
    { variable: 'DATABASE_URL', layer: DatabaseConfig.layer },
    { variable: 'AWS_REGION', layer: AwsConfig.layer },
    { variable: 'STAGE', layer: AwsConfig.layer, given: { AWS_REGION: 'eu-central-1' } },
  ])('fails with a ConfigError naming a missing $variable', ({ variable, layer, given }) =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(Layer.build(provideVariables(layer, given ?? {})))

      assert.strictEqual(error._tag, 'ConfigError')
      assert.include(error.message, variable)
    }),
  )

  it.effect('applies the defaults', () =>
    Effect.gen(function* () {
      const { nodeEnv, logLevel } = yield* RuntimeConfig
      const { lockExpiration, lockRefreshInterval } = yield* QueueConfig

      assert.deepStrictEqual(
        { nodeEnv, logLevel, lockExpiration, lockRefreshInterval },
        {
          nodeEnv: 'development',
          logLevel: 'Info',
          lockExpiration: Duration.seconds(15),
          lockRefreshInterval: Duration.seconds(5),
        },
      )
    }).pipe(
      Effect.provide(provideVariables(Layer.mergeAll(RuntimeConfig.layer, QueueConfig.layer), {})),
    ),
  )

  it.effect.each([
    { refresh: '5 seconds', expiration: '5 seconds', printed: '(5s)' },
    { refresh: '1 minute', expiration: '5 seconds', printed: '(1m)' },
  ])(
    'rejects a lock refresh of $refresh against an expiration of $expiration',
    ({ refresh, expiration, printed }) =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(
          Layer.build(
            provideVariables(QueueConfig.layer, {
              QUEUE_LOCK_EXPIRATION: expiration,
              QUEUE_LOCK_REFRESH_INTERVAL: refresh,
            }),
          ),
        )

        assert.strictEqual(error._tag, 'QueueLockRefreshIntervalInvalidError')
        assert.include(error.message, `QUEUE_LOCK_REFRESH_INTERVAL ${printed}`)
        assert.include(error.message, 'QUEUE_LOCK_EXPIRATION (5s)')
      }),
  )

  it.effect.each([
    { given: undefined, parsed: Option.none<string>() },
    { given: 'http://localhost:4566', parsed: Option.some('http://localhost:4566/') },
  ])('reads AWS settings with AWS_ENDPOINT_URL=$given', ({ given, parsed }) =>
    Effect.gen(function* () {
      const { region, endpoint, stage } = yield* AwsConfig

      assert.deepStrictEqual(
        { region, endpoint: Option.map(endpoint, String), stage },
        { region: 'eu-central-1', endpoint: parsed, stage: 'local' },
      )
    }).pipe(
      Effect.provide(
        provideVariables(AwsConfig.layer, {
          AWS_REGION: 'eu-central-1',
          STAGE: 'local',
          ...(given === undefined ? {} : { AWS_ENDPOINT_URL: given }),
        }),
      ),
    ),
  )

  it.effect('reads DATABASE_URL as a Redacted', () =>
    Effect.gen(function* () {
      const { url } = yield* DatabaseConfig

      assert.isTrue(Redacted.isRedacted(url))
      assert.strictEqual(Redacted.value(url), 'postgres://app:secret@localhost:15432/app_template')
    }).pipe(
      Effect.provide(
        provideVariables(DatabaseConfig.layer, {
          DATABASE_URL: 'postgres://app:secret@localhost:15432/app_template',
        }),
      ),
    ),
  )

  it.effect('sets the minimum log level from LOG_LEVEL', () =>
    Effect.map(References.MinimumLogLevel, (minimum) => assert.strictEqual(minimum, 'Debug')).pipe(
      Effect.provide(provideVariables(MinimumLogLevelFromConfig, { LOG_LEVEL: 'Debug' })),
    ),
  )
})
