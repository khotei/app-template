import { assert, describe, it } from '@effect/vitest'
import { assertEquals } from '@effect/vitest/utils'
import { DateTime, Effect, Option } from 'effect'

import { UserId } from '@app-template/application/user'
import type { ChatEntitySet, ChatEntityWhere, MessageEntityWhere } from '@app-template/kernel/data'
import { encodeWith } from '@app-template/packages/schema'
import { assertSchemaEquals, epoch, recordLogs } from '@app-template/packages/testing'

import { Chat, ChatNotFoundError, ChatTitle } from '#chat/domain/chat.model'
import { Message } from '#chat/domain/message.model'
import { TitleChatService } from '#chat/services/title-chat.service'
import { chat, chatId, firstMessage, owner } from '#testing/chat/chat.test-fixture'
import { layerChatTest } from '#testing/chat/chat.test-layer'
import { recordChatAssistant } from '#testing/chat/chat-assistant.test-fake'

const stranger = UserId.make('0192d4e0-7b3a-7c00-8000-000000000011')

describe('TitleChatService', () => {
  it.effect("title titles the user's untitled chat from the one message its ids name", () => {
    const lisbonWeekend = ChatTitle.make('Lisbon weekend')
    const assistant = recordChatAssistant(Effect.succeed(lisbonWeekend))
    const { logs, layer: logger } = recordLogs()
    const reads: Array<MessageEntityWhere> = []
    const updates: Array<readonly [ChatEntitySet, ChatEntityWhere]> = []
    return Effect.gen(function* () {
      const titleChat = yield* TitleChatService
      yield* titleChat.title({ id: firstMessage.id, chatId, userId: owner })

      assert.deepStrictEqual(reads, [{ id: firstMessage.id, chatId, userId: owner }])
      assert.deepStrictEqual(updates, [
        [
          {
            id: chatId,
            title: lisbonWeekend,
            context: null,
            updatedAt: DateTime.toDateUtc(epoch),
          },
          { id: chatId, userId: owner, title: { isNull: true } },
        ],
      ])
      assertEquals(yield* assistant.texts, ['Plan a weekend in Lisbon'])
      assert.deepStrictEqual(logs, [])
    }).pipe(
      Effect.provide([
        layerChatTest(
          {
            messages: {
              selectOne: (where) =>
                Effect.sync(() => {
                  reads.push(where)
                }).pipe(Effect.andThen(encodeWith(Message)(firstMessage)), Effect.map(Option.some)),
            },
            chats: {
              selectOne: () => encodeWith(Chat)(chat).pipe(Effect.map(Option.some)),
              update: (...update) =>
                Effect.sync(() => {
                  updates.push(update)
                }),
            },
          },
          { chatAssistant: assistant.layer },
        ),
        logger,
      ]),
    )
  })

  it.effect(
    "title of ids whose message the store finds none of, another user's, fails its chat as gone, without asking",
    () => {
      const assistant = recordChatAssistant(Effect.succeed(ChatTitle.make('Lisbon weekend')))
      const reads: Array<MessageEntityWhere> = []
      return Effect.gen(function* () {
        const titleChat = yield* TitleChatService
        const error = yield* titleChat
          .title({ id: firstMessage.id, chatId, userId: stranger })
          .pipe(Effect.flip)

        assertSchemaEquals(ChatNotFoundError, error, new ChatNotFoundError({ id: chatId }))
        assert.deepStrictEqual(reads, [{ id: firstMessage.id, chatId, userId: stranger }])
        assertEquals(yield* assistant.texts, [])
      }).pipe(
        Effect.provide(
          layerChatTest(
            {
              messages: {
                selectOne: (where) =>
                  Effect.sync(() => {
                    reads.push(where)
                  }).pipe(Effect.as(Option.none())),
              },
            },
            { chatAssistant: assistant.layer },
          ),
        ),
      )
    },
  )
})
