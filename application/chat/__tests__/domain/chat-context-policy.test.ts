import { assert, describe, it } from '@effect/vitest'

import { ChatContextPolicy } from '#chat/domain/chat-context-policy'

describe('ChatContextPolicy.isOverLimit', () => {
  it.each([
    { tokensSize: 0, over: false },
    { tokensSize: 800, over: false },
    { tokensSize: 801, over: true },
  ])(
    'is $over of $tokensSize tokens under a limit of 1000, cut past 0.8 of it',
    ({ tokensSize, over }) => {
      assert.strictEqual(
        ChatContextPolicy.isOverLimit({ promptTokens: tokensSize, outputTokens: 0 }, 1000),
        over,
      )
    },
  )
})
