import { assert, describe, it } from '@effect/vitest'
import { Schema } from 'effect'

import { MessageFields } from '#chat/domain/message.model'

const isText = Schema.is(MessageFields.fields.text)

describe('MessageFields', () => {
  it.each([{ text: '' }, { text: '  \n\t ' }])('rejects the blank text $text', ({ text }) => {
    assert.isFalse(isText(text))
  })

  it('accepts a text', () => {
    assert.isTrue(isText('Hello'))
  })

  it('rejects a text holding U+0000, which Postgres refuses', () => {
    assert.isFalse(isText('a\u0000b'))
  })
})
