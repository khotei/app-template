import { assert } from '@effect/vitest'
import { Effect } from 'effect'

import { ApiClient } from '@app-template/http-api'
import { describeOnMiniStack } from '@app-template/testing'

import { ApiTest } from '#api/testing/api.harness'

describeOnMiniStack('health', (it) => {
  it.effect('GET /health is ok', () =>
    Effect.gen(function* () {
      const api = yield* ApiClient

      assert.deepStrictEqual(yield* api.health.get(), { status: 'ok' })
    }).pipe(Effect.provide(ApiTest)),
  )
})
