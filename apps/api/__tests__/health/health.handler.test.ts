import { assert, describe, it } from '@effect/vitest'
import { Effect } from 'effect'

import { layerApiTest } from '#testing/api.test-layer'
import { ApiClient } from '#testing/api-client.test-layer'

describe('health', () => {
  it.effect('GET /health is ok', () =>
    Effect.gen(function* () {
      const api = yield* ApiClient

      assert.deepStrictEqual(yield* api.health.get(), { status: 'ok' })
    }).pipe(Effect.provide(layerApiTest())),
  )
})
