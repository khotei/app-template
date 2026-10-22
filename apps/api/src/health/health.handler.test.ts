import { assert, describe, layer } from '@effect/vitest'
import { Effect } from 'effect'

import { makeApiHarness, withApi } from '#api/testing/api.harness'

describe('health', () => {
  layer(makeApiHarness())((it) => {
    it.effect('GET /health is ok', () =>
      withApi((api) =>
        Effect.gen(function* () {
          assert.deepStrictEqual(yield* api.health.get(), { status: 'ok' })
        }),
      ),
    )
  })
})
