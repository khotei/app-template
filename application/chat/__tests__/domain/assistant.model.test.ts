import { assert, describe, it } from '@effect/vitest'
import { Option, Schema } from 'effect'

import { AssistantReply } from '#chat/domain/assistant.model'

const decodeReply = Schema.decodeUnknownOption(AssistantReply)

describe('AssistantReply', () => {
  it.each(['Sure.', ' Sure.\n'])('accepts the text %j', (text) => {
    assert.isTrue(decodeReply({ text }).pipe(Option.isSome))
  })

  it.each(['', ' \n\t '])('rejects the blank text %j', (text) => {
    assert.isTrue(decodeReply({ text }).pipe(Option.isNone))
  })
})
