import { assert, describe, it, layer } from '@effect/vitest'
import { Effect } from 'effect'

import { makeApiHarness, spec, withApi } from '#api/testing/api.harness'

describe('health', () => {
  layer(makeApiHarness(), { timeout: '60 seconds' })((it) => {
    it.effect('GET /health is ok', () =>
      withApi((api) =>
        Effect.gen(function* () {
          assert.deepStrictEqual(yield* api.health.get(), { status: 'ok' })
        }),
      ),
    )
  })

  it.effect('GET /health asks for no credential', () =>
    Effect.sync(() => assert.deepStrictEqual(spec.paths['/health']?.get?.security, [])),
  )
})
