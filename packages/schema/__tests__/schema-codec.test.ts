import { assert, describe, it } from '@effect/vitest'
import { Effect, Schema, SchemaIssue } from 'effect'

import { makeRowWith } from '#schema/schema-codec'

const Sample = Schema.Struct({
  count: Schema.NumberFromString.check(Schema.isGreaterThan(0)),
  tag: Schema.String.pipe(Schema.withConstructorDefault(Effect.succeed('new'))),
})

describe('makeRowWith', () => {
  it.effect('makes the value with its defaults and encodes its row', () =>
    Effect.gen(function* () {
      const { set, row } = yield* makeRowWith(Sample)({ count: 2 })

      assert.deepStrictEqual(
        [set, row],
        [
          { count: 2, tag: 'new' },
          { count: '2', tag: 'new' },
        ],
      )
    }),
  )

  it.effect('fails a value its schema refuses with the issue', () =>
    Effect.gen(function* () {
      const issue = yield* makeRowWith(Sample)({ count: 0 }).pipe(Effect.flip)

      assert.isTrue(SchemaIssue.isIssue(issue))
    }),
  )
})
