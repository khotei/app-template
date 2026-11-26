import { assert, describe, it } from '@effect/vitest'
import { assertEquals } from '@effect/vitest/utils'
import { Effect, Option } from 'effect'

import type { ChatEntitySelectWhere, MessageEntityWhere } from '@app-template/kernel/data'
import { encodeWith } from '@app-template/packages/schema'

import { Chat } from '#chat/domain/chat.model'
import { Message } from '#chat/domain/message.model'
import { ChatContextService } from '#chat/services/chat-context.service'
import { chat, firstMessage, owner } from '#testing/chat/chat.test-fixture'
import { layerChatTest } from '#testing/chat/chat.test-layer'

const cut = new Chat({
  ...chat,
  context: Option.some({ latestSummary: 'A summary.', startMessageId: firstMessage.id }),
})

describe('ChatContextService', () => {
  it.effect.each([
    {
      name: 'an uncut chat, every message',
      asked: chat,
      read: { chatId: chat.id },
      sent: [firstMessage],
    },
    {
      name: 'a cut chat, those from the start its context stores, opened by its summary',
      asked: cut,
      read: { chatId: chat.id, id: { gte: firstMessage.id } },
      sent: [
        {
          author: 'user' as const,
          text: 'Earlier messages of this conversation are not shown to you. A summary of them:\n\nA summary.',
        },
        firstMessage,
      ],
    },
  ])("getMessages reads the context of the user's chat: $name", ({ asked, read, sent }) => {
    const chatWheres: Array<ChatEntitySelectWhere> = []
    const messageWheres: Array<MessageEntityWhere> = []
    return Effect.gen(function* () {
      const contexts = yield* ChatContextService

      const found = yield* contexts.getMessages({ chatId: chat.id, userId: owner })

      assertEquals(found, sent)
      assert.deepStrictEqual(chatWheres, [{ id: chat.id, userId: owner }])
      assert.deepStrictEqual(messageWheres, [read])
    }).pipe(
      Effect.provide(
        layerChatTest({
          chats: {
            selectOne: (where) =>
              Effect.sync(() => {
                chatWheres.push(where)
              }).pipe(Effect.andThen(encodeWith(Chat)(asked)), Effect.map(Option.some)),
          },
          messages: {
            selectMany: (where) =>
              Effect.sync(() => {
                messageWheres.push(where)
              }).pipe(Effect.andThen(encodeWith(Message)(firstMessage)), Effect.map(Array.of)),
          },
        }),
      ),
    )
  })
})
