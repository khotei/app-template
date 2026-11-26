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

/** The split of `messages`, its halves as plain lists, which an expected one is built of. */
const splitOf = (
  messages: ReadonlyArray<Message>,
  tokensLimit: number,
): Option.Option<{
  readonly toCompact: ReadonlyArray<Message>
  readonly remain: ReadonlyArray<Message>
}> => ChatContextTokenizer.splitToCompact(messages, tokensLimit)

/** `messages` split before the message at `index`, as a context that starts there is split. */
const splitAt = (messages: ReadonlyArray<Message>, index: number) =>
  Option.some({ toCompact: Arr.take(messages, index), remain: Arr.drop(messages, index) })

describe('ChatContextTokenizer.splitToCompact', () => {
  it("leaves out the messages before the oldest user's whose tail holds at most 0.3 of the limit", () => {
    // 900 tokens over 600 characters: 300 tokens are 200 characters, the last two messages.
    assert.deepStrictEqual(splitOf(sized(even, 900), 1000), splitAt(sized(even, 900), 4))
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
    assert.deepStrictEqual(splitOf(sized(messages, 900), 1000), splitAt(sized(messages, 900), 4))
  })

  it("starts at the newest user's message when no user's message opens a tail that fits", () => {
    const messages = [
      userMessageAt(1, chars(2000)),
      assistantMessageAt(2, chars(20_000)),
      userMessageAt(3, chars(500)),
      assistantMessageAt(4, chars(12_000)),
    ]

    assert.deepStrictEqual(
      splitOf(sized(messages, 9000), 10_000),
      splitAt(sized(messages, 9000), 2),
    )
  })

  it("is none when the newest user's message is the first, as nothing can go", () => {
    const messages = [userMessageAt(1, chars(100)), assistantMessageAt(2, chars(100))]

    assert.deepStrictEqual(
      ChatContextTokenizer.splitToCompact(sized(messages, 900), 1000),
      Option.none(),
    )
  })

  it('is none when no Run with a usage wrote the last message', () => {
    assert.deepStrictEqual(ChatContextTokenizer.splitToCompact(even, 1000), Option.none())
  })
})

describe('ChatContextTokenizer.withContext', () => {
  const ofWhat = userMessageAt(3, 'Of what?')

  it('sends the messages of an uncut chat as they are', () => {
    assert.deepStrictEqual(ChatContextTokenizer.withContext(Option.none(), [ofWhat]), [ofWhat])
  })

  it("opens a cut chat's messages with the summary its context holds", () => {
    const context = { compacted: 'They spoke of a photo.', headMessageId: ofWhat.id }

    assert.deepStrictEqual(ChatContextTokenizer.withContext(Option.some(context), [ofWhat]), [
      {
        author: 'user',
        text: 'Earlier messages of this conversation are not shown to you. A summary of them:\n\nThey spoke of a photo.',
      },
      ofWhat,
    ])
  })
})
