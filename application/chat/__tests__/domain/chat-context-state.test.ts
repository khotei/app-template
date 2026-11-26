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

describe('ChatContextState.isOversized', () => {
  it.each([
    { tokensSize: 0, oversized: false },
    { tokensSize: 800, oversized: false },
    { tokensSize: 801, oversized: true },
  ])(
    'is $oversized of $tokensSize tokens under a limit of 1000, cut past 0.8 of it',
    ({ tokensSize, oversized }) => {
      assert.strictEqual(ChatContextState.isOversized(tokensSize, 1000), oversized)
    },
  )
})

describe('ChatContextState.cut', () => {
  it('cuts a context to the messages that hold at most 0.3 of the limit', () => {
    // 900 tokens over 600 characters: 300 tokens are 200 characters, the last two messages.
    assert.deepStrictEqual(
      ChatContextState.cut(whole, { tokensSize: 900, tokensLimit: 1000 }),
      new ChatContext({
        startMessageId: Option.some(userMessageAt(5, chars(100)).id),
        messages: Arr.takeRight(even, 2),
      }),
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
    const cut = ChatContextState.cut(new ChatContext({ ...whole, messages }), {
      tokensSize: 900,
      tokensLimit: 1000,
    })

    assert.deepStrictEqual(cut.startMessageId, Option.some(userMessageAt(5, chars(100)).id))
  })

  it("starts at the newest user's message when no user's message opens a tail that fits", () => {
    const messages = [
      userMessageAt(1, chars(2000)),
      assistantMessageAt(2, chars(20_000)),
      userMessageAt(3, chars(500)),
      assistantMessageAt(4, chars(12_000)),
    ]

    assert.deepStrictEqual(
      ChatContextState.cut(new ChatContext({ ...whole, messages }), {
        tokensSize: 9000,
        tokensLimit: 10_000,
      }),
      new ChatContext({
        startMessageId: Option.some(userMessageAt(3, chars(500)).id),
        messages: Arr.takeRight(messages, 2),
      }),
    )
  })

  it('keeps the summary the context had', () => {
    const context = new ChatContext({ ...whole, summary: Option.some('Before.') })

    assert.deepStrictEqual(
      ChatContextState.cut(context, { tokensSize: 900, tokensLimit: 1000 }).summary,
      context.summary,
    )
  })

  it("leaves a context whose newest user's message is its first, as nothing can go", () => {
    const messages = [userMessageAt(1, chars(100)), assistantMessageAt(2, chars(100))]
    const context = new ChatContext({ ...whole, messages })

    assert.strictEqual(
      ChatContextState.cut(context, { tokensSize: 900, tokensLimit: 1000 }),
      context,
    )
  })
})

describe('ChatContextState.leftOut', () => {
  it('holds the messages a cut leaves out, from the start and with the summary before it', () => {
    const context = new ChatContext({
      startMessageId: Option.some(userMessageAt(1, chars(100)).id),
      summary: Option.some('Before.'),
      messages: even,
    })

    assert.deepStrictEqual(
      ChatContextState.leftOut(
        context,
        ChatContextState.cut(context, { tokensSize: 900, tokensLimit: 1000 }),
      ),
      new ChatContext({ ...context, messages: Arr.take(even, 4) }),
    )
  })

  it('holds no message of a context its cut left whole', () => {
    assert.deepStrictEqual(ChatContextState.leftOut(whole, whole).messages, [])
  })
})
