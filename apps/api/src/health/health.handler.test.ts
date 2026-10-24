import { assert, describe, it } from '@effect/vitest'
import { Effect } from 'effect'

import { ApiClient } from '@app-template/http-api'

import { ApiTest } from '#api/testing/api.harness'

describe('health', () => {
  it.effect('GET /health is ok', () =>
    Effect.gen(function* () {
      const api = yield* ApiClient

      assert.deepStrictEqual(yield* api.health.get(), { status: 'ok' })
    }).pipe(Effect.provide(ApiTest)),
  )
})
