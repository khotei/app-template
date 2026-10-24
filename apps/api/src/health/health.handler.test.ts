import { assert } from '@effect/vitest'
import { Effect } from 'effect'

import { describeOnMiniStack } from '@app-template/testing'

import { withApi } from '#api/testing/api.harness'

describeOnMiniStack('health', (it) => {
  it.effect('GET /health is ok', () =>
    withApi((api) =>
      Effect.gen(function* () {
        assert.deepStrictEqual(yield* api.health.get(), { status: 'ok' })
      }),
    ),
  )
})
