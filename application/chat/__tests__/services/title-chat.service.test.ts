import { assert, describe, it } from '@effect/vitest'
import { assertEquals } from '@effect/vitest/utils'
import { DateTime, Effect, Option } from 'effect'

import type { ChatEntitySet, ChatEntityWhere } from '@app-template/kernel/data'
import { encodeWith } from '@app-template/packages/schema'
import { assertSchemaEquals, epoch, recordLogs } from '@app-template/packages/testing'

import { ChatNotFoundError } from '#chat/domain/chat.error'
import { Chat, ChatTitle } from '#chat/domain/chat.model'
import { Message } from '#chat/domain/message.model'
import { TitleChatService } from '#chat/services/title-chat.service'
import { assistantMessageAt, chat, chatId, firstMessage } from '#testing/chat/chat.test-fixture'
import { layerChatTest } from '#testing/chat/chat.test-layer'
import { recordChatAssistant } from '#testing/chat/chat-assistant.test-fake'

const aPhoto = assistantMessageAt(2, 'A photo.')

describe('TitleChatService', () => {
  it.effect('title titles the chat from its first message while the chat is untitled', () => {
    const lisbonWeekend = ChatTitle.make('Lisbon weekend')
    const assistant = recordChatAssistant(Effect.succeed(lisbonWeekend))
    const { logs, layer: logger } = recordLogs()
    const updates: Array<readonly [ChatEntitySet, ChatEntityWhere]> = []
    return Effect.gen(function* () {
      yield* TitleChatService.use((titleChat) => titleChat.title(chatId))

      assert.deepStrictEqual(updates, [
        [
          { title: lisbonWeekend, updatedAt: DateTime.toDateUtc(epoch) },
          { id: chatId, title: null },
        ],
      ])
      assertEquals(yield* assistant.texts, ['Plan a weekend in Lisbon'])
      assert.deepStrictEqual(logs, [])
    }).pipe(
      Effect.provide([
        layerChatTest(
          {
            messages: {
              selectMany: () =>
                Effect.forEach([firstMessage, aPhoto], (message) => encodeWith(Message)(message)),
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

  it.effect('title fails a chat with no message as gone, without asking', () => {
    const assistant = recordChatAssistant(Effect.succeed(ChatTitle.make('Lisbon weekend')))
    return Effect.gen(function* () {
      const error = yield* TitleChatService.use((titleChat) => titleChat.title(chatId)).pipe(
        Effect.flip,
      )

      assertSchemaEquals(ChatNotFoundError, error, new ChatNotFoundError({ id: chatId }))
      assertEquals(yield* assistant.texts, [])
    }).pipe(
      Effect.provide(
        layerChatTest(
          { messages: { selectMany: () => Effect.succeed([]) } },
          { chatAssistant: assistant.layer },
        ),
      ),
    )
  })
})
