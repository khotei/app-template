import { assert, describe, it } from '@effect/vitest'
import { assertEquals } from '@effect/vitest/utils'
import { Effect, Option } from 'effect'

import type {
  ChatEntitySelectWhere,
  ChatEntitySet,
  MessageEntityWhere,
} from '@app-template/kernel/data'
import { encodeWith } from '@app-template/packages/schema'

import { Chat } from '#chat/domain/chat.model'
import { Message } from '#chat/domain/message.model'
import { ChatContextService } from '#chat/services/chat-context.service'
import {
  answeredBy,
  assistantMessageAt,
  assistantOverloaded,
  chat,
  firstMessage,
  owner,
  sureReply,
  userMessageAt,
} from '#testing/chat/chat.test-fixture'
import { layerChatTest } from '#testing/chat/chat.test-layer'
import { recordMessageAssistant } from '#testing/chat/message-assistant.test-fake'

const where = { chatId: chat.id, userId: owner }

const cut = new Chat({
  ...chat,
  context: Option.some({ latestSummary: 'A summary.', startMessageId: firstMessage.id }),
})

/** A store that holds `asked` and `stored`, keeping each chat write. */
const storing = (asked: Chat, stored: ReadonlyArray<Message>) => {
  const writes: Array<Partial<ChatEntitySet>> = []
  return {
    writes,
    mocks: {
      chats: {
        selectOne: () => encodeWith(Chat)(asked).pipe(Effect.map(Option.some)),
        update: (set: Partial<ChatEntitySet>) =>
          Effect.sync(() => {
            writes.push(set)
          }),
      },
      messages: {
        selectMany: () => Effect.forEach(stored, (message) => encodeWith(Message)(message)),
      },
    },
  }
}

// 135 tokens over 500 characters, under a limit of 150: a cut keeps a third, the last message.
const long = userMessageAt(1, 'x'.repeat(300))
const longReply = assistantMessageAt(2, 'x'.repeat(100))
const short = answeredBy(userMessageAt(3, 'x'.repeat(100)))

describe('ChatContextService', () => {
  it.effect.each([
    { name: 'an uncut chat, every message', asked: chat, read: { chatId: chat.id } },
    {
      name: 'a cut chat, those from the start its context stores',
      asked: cut,
      read: { chatId: chat.id, id: { gte: firstMessage.id } },
    },
  ])("getMessages reads the messages of the user's chat: $name", ({ asked, read }) => {
    const chatWheres: Array<ChatEntitySelectWhere> = []
    const messageWheres: Array<MessageEntityWhere> = []
    return Effect.gen(function* () {
      const contexts = yield* ChatContextService

      const found = yield* contexts.getMessages(where)

      assertEquals(found, [firstMessage])
      assert.deepStrictEqual(chatWheres, [{ id: chat.id, userId: owner }])
      assert.deepStrictEqual(messageWheres, [read])
    }).pipe(
      Effect.provide(
        layerChatTest({
          chats: {
            selectOne: (read) =>
              Effect.sync(() => {
                chatWheres.push(read)
              }).pipe(Effect.andThen(encodeWith(Chat)(asked)), Effect.map(Option.some)),
          },
          messages: {
            selectMany: (read) =>
              Effect.sync(() => {
                messageWheres.push(read)
              }).pipe(Effect.andThen(encodeWith(Message)(firstMessage)), Effect.map(Array.of)),
          },
        }),
      ),
    )
  })

  it.effect.each([
    { name: 'none of an uncut chat', asked: chat, summary: Option.none<string>() },
    { name: 'the latest of a cut chat', asked: cut, summary: Option.some('A summary.') },
  ])('getSummary reads $name', ({ asked, summary }) =>
    Effect.gen(function* () {
      const contexts = yield* ChatContextService

      assert.deepStrictEqual(yield* contexts.getSummary(where), summary)
    }).pipe(Effect.provide(layerChatTest(storing(asked, []).mocks))),
  )

  it.effect(
    'compact summarises the messages a cut leaves out, with the summary the context had, and stores the summary with the first message kept',
    () => {
      const assistant = recordMessageAssistant(Effect.succeed(sureReply), {
        contextTokensLimit: 150,
        summary: Effect.succeed('A newer summary.'),
      })
      const store = storing(cut, [long, longReply, short])
      return Effect.gen(function* () {
        const contexts = yield* ChatContextService

        yield* contexts.compact(where)

        assertEquals(yield* assistant.summarised, [[long, longReply]])
        assert.deepStrictEqual(yield* assistant.summaries, [Option.some('A summary.')])
        assert.deepStrictEqual(
          store.writes.map(({ context }) => context),
          [{ latestSummary: 'A newer summary.', startMessageId: short.id }],
        )
      }).pipe(Effect.provide(layerChatTest(store.mocks, { messageAssistant: assistant.layer })))
    },
  )

  it.effect('compact whose summary fails fails as the assistant did and writes no chat', () => {
    const assistant = recordMessageAssistant(Effect.succeed(sureReply), {
      contextTokensLimit: 150,
      summary: Effect.fail(assistantOverloaded),
    })
    const store = storing(chat, [long, longReply, short])
    return Effect.gen(function* () {
      const contexts = yield* ChatContextService

      const error = yield* contexts.compact(where).pipe(Effect.flip)

      assert.strictEqual(error, assistantOverloaded)
      assert.deepStrictEqual(store.writes, [])
    }).pipe(Effect.provide(layerChatTest(store.mocks, { messageAssistant: assistant.layer })))
  })

  it.effect('compact of a context no cut shortens asks for no summary and writes no chat', () => {
    const assistant = recordMessageAssistant(Effect.succeed(sureReply), { contextTokensLimit: 150 })
    const store = storing(chat, [long, answeredBy(longReply)])
    return Effect.gen(function* () {
      const contexts = yield* ChatContextService

      yield* contexts.compact(where)

      assertEquals(yield* assistant.summarised, [])
      assert.deepStrictEqual(store.writes, [])
    }).pipe(Effect.provide(layerChatTest(store.mocks, { messageAssistant: assistant.layer })))
  })
})
