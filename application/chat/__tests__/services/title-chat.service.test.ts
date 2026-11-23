import { assert, describe, it } from '@effect/vitest'
import { assertEquals } from '@effect/vitest/utils'
import { DateTime, Effect, Option, Schema } from 'effect'

import { assertSchemaEquals, epoch, recordLogs } from '@app-template/packages/testing'

import { ChatNotFoundError } from '#chat/domain/chat.error'
import { ChatFields, ChatTitle } from '#chat/domain/chat.model'
import type { ChatFilter } from '#chat/services/chat.repository'
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
    const updates: Array<readonly [typeof ChatFields.update.Type, ChatFilter]> = []
    return Effect.gen(function* () {
      yield* TitleChatService.use((titleChat) => titleChat.title(chatId))

      assert.deepStrictEqual(
        updates.map(([set, where]) => [Schema.encodeUnknownSync(ChatFields.update)(set), where]),
        [
          [
            { id: chatId, title: lisbonWeekend, updatedAt: DateTime.toDateUtc(epoch) },
            { id: chatId, title: Option.none() },
          ],
        ],
      )
      assertEquals(yield* assistant.texts, ['Plan a weekend in Lisbon'])
      assert.deepStrictEqual(logs, [])
    }).pipe(
      Effect.provide([
        layerChatTest(
          {
            messages: {
              selectMany: () => Effect.succeed([firstMessage, aPhoto]),
            },
            chats: {
              selectOne: () => Effect.succeedSome(chat),
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
