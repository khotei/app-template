import { assert, describe, it } from '@effect/vitest'
import { Option } from 'effect'

import { ChatUsageState } from '#chat/domain/chat-usage-state'
import { chatUsage, runUsage, userMessageAt } from '#testing/chat/chat.test-fixture'

const start = userMessageAt(3, 'Of what?').id

describe('ChatUsageState.add', () => {
  it("starts a chat's usage at its first reply's, the context sized by that reply", () => {
    assert.deepStrictEqual(
      ChatUsageState.add(Option.none(), runUsage, { startMessageId: Option.none() }),
      chatUsage,
    )
  })

  it("adds a reply's counts to the total and takes the context's size and start from the reply", () => {
    const next = ChatUsageState.add(
      Option.some(chatUsage),
      { ...runUsage, promptTokens: 300, outputTokens: 10 },
      { startMessageId: Option.some(start) },
    )

    assert.deepStrictEqual(next, {
      total: { promptTokens: 430, outputTokens: 15, cacheReadTokens: 200, cacheWriteTokens: 40 },
      context: { tokensSize: 310, startMessageId: Option.some(start) },
    })
  })
})
