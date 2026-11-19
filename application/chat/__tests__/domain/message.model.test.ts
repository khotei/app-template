import { assert, describe, it } from '@effect/vitest'
import { Effect, Schema } from 'effect'

import { assertSchemaEquals } from '@app-template/packages/testing'

import { MessageInputInvalidError } from '#chat/domain/message.error'
import { ensureMessageInput, MessageFields } from '#chat/domain/message.model'

describe('ensureMessageInput', () => {
  it.effect.each([{ text: '' }, { text: '  \n\t ' }])('rejects the blank text $text', ({ text }) =>
    Effect.gen(function* () {
      const error = yield* ensureMessageInput({ text }).pipe(Effect.flip)

      assertSchemaEquals(MessageInputInvalidError, error, new MessageInputInvalidError())
    }),
  )

  it.effect('accepts a text', () => ensureMessageInput({ text: 'Hello' }))
})

describe('MessageFields', () => {
  it('rejects a text holding U+0000, which Postgres refuses', () => {
    assert.isFalse(Schema.is(MessageFields.fields.text)('a\u0000b'))
  })
})
