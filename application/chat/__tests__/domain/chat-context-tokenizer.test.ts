import { assert, describe, it } from '@effect/vitest'
import { Array as Arr, Option } from 'effect'

import { ChatContextTokenizer } from '#chat/domain/chat-context-tokenizer'
import { assistantMessageAt, runUsage, userMessageAt } from '#testing/chat/chat.test-fixture'

const chars = (length: number) => 'x'.repeat(length)

/** Six messages of 100 characters each, a user's first. */
const even = Arr.makeBy(6, (i) =>
  i % 2 === 0 ? userMessageAt(i + 1, chars(100)) : assistantMessageAt(i + 1, chars(100)),
)

describe('ChatContextTokenizer.tokensSize', () => {
  it("counts a prompt's tokens with its reply's", () => {
    assert.strictEqual(ChatContextTokenizer.tokensSize(runUsage), 135)
  })
})

describe('ChatContextTokenizer.compact', () => {
  it("keeps the messages from the oldest user's whose tail holds at most 0.3 of the limit", () => {
    // 900 tokens over 600 characters: 300 tokens are 200 characters, the last two messages.
    assert.deepStrictEqual(
      ChatContextTokenizer.compact(even, { tokensSize: 900, tokensLimit: 1000 }),
      Arr.takeRight(even, 2),
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
      ChatContextTokenizer.compact(messages, { tokensSize: 900, tokensLimit: 1000 }),
      Arr.takeRight(messages, 2),
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
      ChatContextTokenizer.compact(messages, { tokensSize: 9000, tokensLimit: 10_000 }),
      Arr.takeRight(messages, 2),
    )
  })

  it("keeps every message when the newest user's is the first, as nothing can go", () => {
    const messages = [userMessageAt(1, chars(100)), assistantMessageAt(2, chars(100))]

    assert.deepStrictEqual(
      ChatContextTokenizer.compact(messages, { tokensSize: 900, tokensLimit: 1000 }),
      messages,
    )
  })
})

describe('ChatContextTokenizer.withContext', () => {
  const aPhoto = assistantMessageAt(2, 'A photo.')
  const ofWhat = userMessageAt(3, 'Of what?')

  it('sends the messages of an uncut chat as they are', () => {
    assert.deepStrictEqual(ChatContextTokenizer.withContext(Option.none(), [ofWhat]), [ofWhat])
  })

  it("opens a cut chat's messages with the summary its context holds", () => {
    const context = { summaryLastMessageId: aPhoto.id, summary: 'They spoke of a photo.' }

    assert.deepStrictEqual(ChatContextTokenizer.withContext(Option.some(context), [ofWhat]), [
      {
        author: 'user',
        text: 'Earlier messages of this conversation are not shown to you. A summary of them:\n\nThey spoke of a photo.',
      },
      ofWhat,
    ])
  })
})
