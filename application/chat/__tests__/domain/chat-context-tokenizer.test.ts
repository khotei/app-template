import { assert, describe, it } from '@effect/vitest'
import { Array as Arr, Option } from 'effect'

import { ChatContextTokenizer } from '#chat/domain/chat-context-tokenizer'
import type { Message } from '#chat/domain/message.model'
import {
  answeredBy,
  assistantMessageAt,
  runUsage,
  userMessageAt,
} from '#testing/chat/chat.test-fixture'

const chars = (length: number) => 'x'.repeat(length)

/** Six messages of 100 characters each, a user's first. */
const even = Arr.makeBy(6, (i) =>
  i % 2 === 0 ? userMessageAt(i + 1, chars(100)) : assistantMessageAt(i + 1, chars(100)),
)

describe('ChatContextTokenizer.tokensSize', () => {
  it("counts the prompt's tokens and the reply's of the Run that wrote a message", () => {
    assert.strictEqual(ChatContextTokenizer.tokensSize(answeredBy(userMessageAt(1, 'Hi'))), 135)
  })

  it('counts none for a message no done Run wrote', () => {
    assert.strictEqual(ChatContextTokenizer.tokensSize(userMessageAt(1, 'Hi')), 0)
  })
})

/** `messages` as read after a reply whose prompt and text held `tokens`: the last with its Run. */
const sized = (messages: ReadonlyArray<Message>, tokens: number) =>
  Arr.map(messages, (message, index) =>
    index === messages.length - 1
      ? answeredBy(message, { ...runUsage, promptTokens: tokens, outputTokens: 0 })
      : message,
  )

describe('ChatContextTokenizer.cut', () => {
  it("leaves out the messages before the oldest user's whose tail holds at most 0.3 of the limit", () => {
    // 900 tokens over 600 characters: 300 tokens are 200 characters, the last two messages.
    assert.deepStrictEqual(
      ChatContextTokenizer.cut(sized(even, 900), 1000),
      Option.some({
        earlierMessages: Arr.take(even, 4),
        startMessageId: Arr.getUnsafe(even, 4).id,
      }),
    )
  })

  it("starts at a user's message, though an assistant's before it opens a tail that fits", () => {
    const messages = [
      userMessageAt(1, chars(300)),
      assistantMessageAt(2, chars(100)),
      userMessageAt(3, chars(200)),
      assistantMessageAt(4, chars(100)),
      userMessageAt(5, chars(100)),
      assistantMessageAt(6, chars(100)),
    ]

    // 900 tokens over 900 characters: 300 characters fit, the last three messages.
    assert.deepStrictEqual(
      ChatContextTokenizer.cut(sized(messages, 900), 1000),
      Option.some({
        earlierMessages: Arr.take(messages, 4),
        startMessageId: Arr.getUnsafe(messages, 4).id,
      }),
    )
  })

  it("starts at the newest user's message when no user's message opens a tail that fits", () => {
    const messages = [
      userMessageAt(1, chars(2000)),
      assistantMessageAt(2, chars(20_000)),
      userMessageAt(3, chars(500)),
      assistantMessageAt(4, chars(12_000)),
    ]

    assert.deepStrictEqual(
      ChatContextTokenizer.cut(sized(messages, 9000), 10_000),
      Option.some({
        earlierMessages: Arr.take(messages, 2),
        startMessageId: Arr.getUnsafe(messages, 2).id,
      }),
    )
  })

  it("cuts nothing when the newest user's message is the first, as nothing can go", () => {
    const messages = [userMessageAt(1, chars(100)), assistantMessageAt(2, chars(100))]

    assert.deepStrictEqual(ChatContextTokenizer.cut(sized(messages, 900), 1000), Option.none())
  })

  it('cuts nothing when no Run with a usage wrote the last message', () => {
    assert.deepStrictEqual(ChatContextTokenizer.cut(even, 1000), Option.none())
  })
})

describe('ChatContextTokenizer.withContext', () => {
  const ofWhat = userMessageAt(3, 'Of what?')

  it('sends the messages of an uncut chat as they are', () => {
    assert.deepStrictEqual(ChatContextTokenizer.withContext(Option.none(), [ofWhat]), [ofWhat])
  })

  it("opens a cut chat's messages with the summary its context holds", () => {
    const context = { summary: 'They spoke of a photo.', startMessageId: ofWhat.id }

    assert.deepStrictEqual(ChatContextTokenizer.withContext(Option.some(context), [ofWhat]), [
      {
        author: 'user',
        text: 'Earlier messages of this conversation are not shown to you. A summary of them:\n\nThey spoke of a photo.',
      },
      ofWhat,
    ])
  })
})
