import { assert, describe, it } from '@effect/vitest'
import { ConfigProvider, Duration, Effect, Layer, LogLevel, References } from 'effect'

import { ApiConfig, MinimumLogLevelFromConfig, QueueConfig, RuntimeConfig } from '#config/config'

const provideVariables = <A, E>(layer: Layer.Layer<A, E>, variables: Record<string, string>) =>
  layer.pipe(Layer.provide(ConfigProvider.layer(ConfigProvider.fromUnknown(variables))))

describe('config layers', () => {
  it.effect('fails with a ConfigError naming a missing variable', () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(Layer.build(provideVariables(ApiConfig.layer, {})))

      assert.strictEqual(error._tag, 'ConfigError')
      assert.include(error.message, 'API_PORT')
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
      Effect.provide(
        provideVariables(Layer.mergeAll(RuntimeConfig.layer, QueueConfig.layer), {
          QUEUE_SQLITE_PATH: '../../.data/queue.sqlite',
        }),
      ),
    ),
  )

  it.effect.each(LogLevel.values)('sets the minimum log level to LOG_LEVEL=%s', (level) =>
    Effect.map(References.MinimumLogLevel, (minimum) => assert.strictEqual(minimum, level)).pipe(
      Effect.provide(provideVariables(MinimumLogLevelFromConfig, { LOG_LEVEL: level })),
    ),
  )

  it.effect('rejects a lower-case LOG_LEVEL', () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        Layer.build(provideVariables(RuntimeConfig.layer, { LOG_LEVEL: 'info' })),
      )

      assert.include(error.message, 'LOG_LEVEL')
    }),
  )
})
