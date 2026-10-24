import { assert, describe } from '@effect/vitest'
import { Effect } from 'effect'

import { apiSuite, withApi } from '#api/testing/api.harness'

describe('health', () => {
  apiSuite((it) => {
    it.effect('GET /health is ok', () =>
      withApi((api) =>
        Effect.gen(function* () {
          assert.deepStrictEqual(yield* api.health.get(), { status: 'ok' })
        }),
      ),
    )
  })
})
