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

describe('ChatContextTokenizer.usageTokensSize', () => {
  it("counts a usage's prompt tokens and its output's", () => {
    assert.strictEqual(ChatContextTokenizer.usageTokensSize(runUsage), 135)
  })
})

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

/** `messages` split before the message at `index`. */
const splitAt = (messages: ReadonlyArray<Message>, index: number) => ({
  dropped: Arr.take(messages, index),
  remain: Arr.drop(messages, index),
})

describe('ChatContextTokenizer.splitToCompact', () => {
  it('drops the messages before the oldest whose tail holds at most 0.3 of the limit', () => {
    // 900 tokens over 600 characters: 300 tokens are 200 characters, the last two messages.
    const messages = sized(even, 900)

    assert.deepStrictEqual(
      ChatContextTokenizer.splitToCompact(messages, 1000),
      splitAt(messages, 4),
    )
  })

  it("starts what remains at an assistant's message when its tail is the oldest that fits", () => {
    const messages = sized(
      [
        userMessageAt(1, chars(300)),
        assistantMessageAt(2, chars(100)),
        userMessageAt(3, chars(200)),
        assistantMessageAt(4, chars(100)),
        userMessageAt(5, chars(100)),
        assistantMessageAt(6, chars(100)),
      ],
      900,
    )

    // 900 tokens over 900 characters: 300 characters fit, the last three messages.
    assert.deepStrictEqual(
      ChatContextTokenizer.splitToCompact(messages, 1000),
      splitAt(messages, 3),
    )
  })

  it('leaves the last message alone when not even its tail fits', () => {
    const messages = sized(
      [
        userMessageAt(1, chars(2000)),
        assistantMessageAt(2, chars(20_000)),
        userMessageAt(3, chars(500)),
        assistantMessageAt(4, chars(12_000)),
      ],
      9000,
    )

    assert.deepStrictEqual(
      ChatContextTokenizer.splitToCompact(messages, 10_000),
      splitAt(messages, 3),
    )
  })

  it('drops none when the whole context fits 0.3 of the limit', () => {
    const messages = sized(even, 300)

    assert.deepStrictEqual(
      ChatContextTokenizer.splitToCompact(messages, 1000),
      splitAt(messages, 0),
    )
  })

  it('splits a context between 0.3 and 0.8 of the limit too, as its caller asks the policy', () => {
    // 500 tokens over 600 characters: 300 tokens are 360 characters, the last three messages.
    const messages = sized(even, 500)

    assert.deepStrictEqual(
      ChatContextTokenizer.splitToCompact(messages, 1000),
      splitAt(messages, 3),
    )
  })

  it('reads the size from the last message a done Run wrote, a later one holding none', () => {
    // As a compaction reads them: the last reply with its Run, then the question not yet answered.
    const messages = [...sized(Arr.take(even, 5), 900), ...Arr.drop(even, 5)]

    assert.deepStrictEqual(
      ChatContextTokenizer.splitToCompact(messages, 1000),
      splitAt(messages, 4),
    )
  })

  it('drops none when no Run with a usage wrote a message', () => {
    assert.deepStrictEqual(ChatContextTokenizer.splitToCompact(even, 1000), splitAt(even, 0))
  })

  it('splits no messages into none dropped and none that remain', () => {
    assert.deepStrictEqual(ChatContextTokenizer.splitToCompact([], 1000), splitAt([], 0))
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
