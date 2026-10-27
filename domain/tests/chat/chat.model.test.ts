import { assert, describe, it } from '@effect/vitest'
import { Schema } from 'effect'

import { ChatTitle } from '#domain/chat/chat.model'

describe('ChatTitle', () => {
  it.each(['Trip', 'a'.repeat(120)])('accepts %j', (title) => {
    assert.isTrue(Schema.is(ChatTitle)(title))
  })

  it.each(['', '  ', ' Trip', 'a'.repeat(121)])('rejects %j', (title) => {
    assert.isFalse(Schema.is(ChatTitle)(title))
  })
})
