import { assert, describe, it } from '@effect/vitest'
import { Option, Schema } from 'effect'

import { AssistantReply } from '#chat/infrastructure/message-assistant.llm'
import { runUsage as usage } from '#testing/chat/chat.test-fixture'

const decodeReply = Schema.decodeUnknownOption(AssistantReply)

describe('AssistantReply', () => {
  it.each([{ text: 'Sure.' }, { text: ' Sure.\n' }])('accepts the text $text', ({ text }) => {
    assert.isTrue(decodeReply({ text, usage }).pipe(Option.isSome))
  })

  it('decodes the text without its U+0000', () => {
    assert.deepStrictEqual(
      decodeReply({ text: 'a\u0000b', usage }),
      Option.some(new AssistantReply({ text: 'ab', usage })),
    )
  })

  it.each([{ text: '' }, { text: ' \n\t ' }, { text: '\u0000 ' }])(
    'rejects the blank text $text',
    ({ text }) => {
      assert.isTrue(decodeReply({ text, usage }).pipe(Option.isNone))
    },
  )
})
