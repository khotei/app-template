import { assert, describe, it } from '@effect/vitest'
import { Config, ConfigProvider, Effect } from 'effect'

import { logLevel, nodeEnv } from '#kernel/config/config'

describe('config', () => {
  it.effect('applies the defaults', () =>
    Effect.gen(function* () {
      assert.deepStrictEqual(yield* Config.all({ nodeEnv, logLevel }), {
        nodeEnv: 'development',
        logLevel: 'Info',
      })
    }).pipe(Effect.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({})))),
  )
})
