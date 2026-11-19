import { assert, describe, it } from '@effect/vitest'
import { Effect, identity, pipe } from 'effect'

import { ensureAllFound } from '#chat/domain/id.util'

describe('ensureAllFound', () => {
  const found = [{ id: 'b' }, { id: 'a' }]

  it.effect('answers what was found when it holds each id asked', () =>
    Effect.gen(function* () {
      assert.strictEqual(yield* pipe(found, ensureAllFound(['a', 'b'], identity)), found)
    }),
  )

  it.effect('fails with each id it lacks, in the order asked', () =>
    Effect.gen(function* () {
      const missing = yield* pipe(found, ensureAllFound(['d', 'a', 'c'], identity), Effect.flip)

      assert.deepStrictEqual(missing, ['d', 'c'])
    }),
  )
})
