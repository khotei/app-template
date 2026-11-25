import { assert, describe, it } from '@effect/vitest'
import { Cause, Effect, Schema } from 'effect'

import { makeRowWith, makeUpdateWith } from '#schema/schema-codec'

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

  it.effect('dies on a value its schema refuses, the defect reading as its message', () =>
    Effect.gen(function* () {
      const cause = yield* makeRowWith(Sample)({ count: 0 }).pipe(Effect.sandbox, Effect.flip)

      assert.isTrue(Cause.hasDies(cause))
      assert.strictEqual(
        Cause.pretty(cause),
        'SchemaError: Expected a value greater than 0\n  at ["count"]',
      )
    }),
  )
})

const Stamped = Schema.Struct({
  count: Schema.NumberFromString,
  updatedAt: Schema.String.pipe(Schema.withConstructorDefault(Effect.succeed('now'))),
})

describe('makeUpdateWith', () => {
  it.effect.each([
    { name: 'a record with its own updatedAt', input: { count: 2, updatedAt: 'read' } },
    { name: 'fields with none', input: { count: 2 } },
  ])("makes the row of $name with the variant's updatedAt", ({ input }) =>
    Effect.gen(function* () {
      const { set, row } = yield* makeUpdateWith(Stamped)(input)

      assert.deepStrictEqual(
        [set, row],
        [
          { count: 2, updatedAt: 'now' },
          { count: '2', updatedAt: 'now' },
        ],
      )
    }),
  )
})
