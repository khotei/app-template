import { assert, describe, layer } from '@effect/vitest'
import { Effect } from 'effect'

import { AwsClientsMiniStack } from '@app-template/testing'

import { withApi, withOwnApi } from '#api/testing/api.harness'

describe('health', () => {
  layer(AwsClientsMiniStack, { timeout: '60 seconds' })((it) => {
    it.effect('GET /health is ok', () =>
      withApi((api) =>
        Effect.gen(function* () {
          assert.deepStrictEqual(yield* api.health.get(), { status: 'ok' })
        }),
      ).pipe(withOwnApi),
    )
  })
})
