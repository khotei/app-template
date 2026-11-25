import { assert, describe, it } from '@effect/vitest'
import { Effect, Equal, Option, Schema } from 'effect'

import { encodeWith } from '@app-template/packages/schema'

import { Message } from '#chat/domain/message.model'
import { firstMessage } from '#testing/chat/chat.test-fixture'

const isText = Schema.is(Message.fields.text)

describe('Message', () => {
  it.each([{ text: '' }, { text: '  \n\t ' }])('rejects the blank text $text', ({ text }) => {
    assert.isFalse(isText(text))
  })

  it('accepts a text', () => {
    assert.isTrue(isText('Hello'))
  })

  it('rejects a text holding U+0000, which Postgres refuses', () => {
    assert.isFalse(isText('a\u0000b'))
  })

  it.effect('decodes the rows it reads into Messages, and dies on a row that does not decode', () =>
    Effect.gen(function* () {
      const row = yield* encodeWith(Message)(firstMessage)

      const one = yield* Message.decodeOne(Option.some(row))
      const [many] = yield* Message.decodeMany([row])
      const defect = yield* Message.decodeOne(Option.some({ ...row, id: 'not-a-uuid' })).pipe(
        Effect.catchDefect(Effect.succeed),
      )

      assert.instanceOf(Option.getOrThrow(one), Message)
      assert.instanceOf(many, Message)
      assert.isTrue(Equal.equals(Option.getOrThrow(one), firstMessage))
      assert.isTrue(Schema.isSchemaError(defect))
    }),
  )
})
