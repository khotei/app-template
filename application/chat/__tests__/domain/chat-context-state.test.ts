import { assert, describe, it } from '@effect/vitest'
import { Array as Arr, Option } from 'effect'

import { ChatContext } from '#chat/domain/chat-context.model'
import { ChatContextState } from '#chat/domain/chat-context-state'
import { assistantMessageAt, runUsage, userMessageAt } from '#testing/chat/chat.test-fixture'

const chars = (length: number) => 'x'.repeat(length)

/** Six messages of 100 characters each, a user's first. */
const even = Arr.makeBy(6, (i) =>
  i % 2 === 0 ? userMessageAt(i + 1, chars(100)) : assistantMessageAt(i + 1, chars(100)),
)

const whole = new ChatContext({ startMessageId: Option.none(), messages: even })

describe('ChatContextState.tokensSize', () => {
  it("counts a prompt's tokens with its reply's", () => {
    assert.strictEqual(ChatContextState.tokensSize(runUsage), 135)
  })
})

describe('ChatContextState.findContext', () => {
  it.each([{ tokensSize: 0 }, { tokensSize: 800 }])(
    'finds none while $tokensSize tokens fit 0.8 of a limit of 1000',
    ({ tokensSize }) => {
      assert.deepStrictEqual(ChatContextState.findContext(whole, tokensSize, 1000), Option.none())
    },
  )

  it('cuts a context past 0.8 of the limit to the messages that hold at most 0.3 of it', () => {
    // 900 tokens over 600 characters: 300 tokens are 200 characters, the last two messages.
    const found = ChatContextState.findContext(whole, 900, 1000)

    assert.deepStrictEqual(
      found,
      Option.some(
        new ChatContext({
          startMessageId: Option.some(userMessageAt(5, chars(100)).id),
          messages: Arr.takeRight(even, 2),
        }),
      ),
    )
  })

  it("starts the cut context at a user's message, though an assistant's before it fits", () => {
    const messages = [
      userMessageAt(1, chars(300)),
      assistantMessageAt(2, chars(100)),
      userMessageAt(3, chars(200)),
      assistantMessageAt(4, chars(100)),
      userMessageAt(5, chars(100)),
      assistantMessageAt(6, chars(100)),
    ]

    // 900 tokens over 900 characters: 300 characters fit, the last three messages.
    const found = ChatContextState.findContext({ messages }, 900, 1000)

    assert.deepStrictEqual(
      Option.map(found, (context) => context.startMessageId),
      Option.some(Option.some(userMessageAt(5, chars(100)).id)),
    )
  })

  it("starts at the newest user's message when no user's message opens a tail that fits", () => {
    const messages = [
      userMessageAt(1, chars(2000)),
      assistantMessageAt(2, chars(20_000)),
      userMessageAt(3, chars(500)),
      assistantMessageAt(4, chars(12_000)),
    ]

    const found = ChatContextState.findContext({ messages }, 9000, 10_000)

    assert.deepStrictEqual(
      found,
      Option.some(
        new ChatContext({
          startMessageId: Option.some(userMessageAt(3, chars(500)).id),
          messages: Arr.takeRight(messages, 2),
        }),
      ),
    )
  })

  it("finds none when the newest user's message is the context's first, as nothing can go", () => {
    const messages = [userMessageAt(1, chars(100)), assistantMessageAt(2, chars(100))]

    assert.deepStrictEqual(ChatContextState.findContext({ messages }, 900, 1000), Option.none())
  })
})
