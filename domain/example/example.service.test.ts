import { assert, describe, it } from '@effect/vitest'
import { DateTime, Effect } from 'effect'

import { ExampleId } from '#domain/example/example.id'
import { buildExample } from '#domain/example/example.service'

describe('buildExample', () => {
  const id = ExampleId.make('0192d4e0-7b3a-7c00-8000-000000000001')
  const createdAt = DateTime.makeUnsafe('2026-10-15T00:00:00.000Z')

  it.effect('trims the name and passes the id and creation time through', () =>
    Effect.gen(function* () {
      const example = yield* buildExample({ id, name: '  First  ', createdAt })

      assert.strictEqual(example.name, 'First')
      assert.strictEqual(example.id, id)
      assert.strictEqual(example.createdAt, createdAt)
    }),
  )

  it.effect.each(['', '   '])('rejects the blank name %j', (name) =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(buildExample({ id, name, createdAt }))

      assert.strictEqual(error._tag, 'ExampleNameInvalidError')
      assert.strictEqual(error.input, name)
    }),
  )
})
