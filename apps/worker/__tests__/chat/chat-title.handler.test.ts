import { BunCrypto } from '@effect/platform-bun'
import { describe, it } from '@effect/vitest'
import { assertEquals } from '@effect/vitest/utils'
import { Effect, Layer, Option } from 'effect'

import { Chat, ChatTitle, GenerateChatTitle } from '@app-template/application/chat'
import {
  chat,
  chatId,
  firstMessage,
  insertMessage,
  messageId,
  recordAssistant,
  selectChat,
} from '@app-template/application/chat/testing'
import { ChatTitleTest } from '@app-template/application/use-cases/testing'

import { ChatTitleHandler } from '#worker/chat/chat-title.handler'

const lisbonWeekend = ChatTitle.make('Lisbon weekend')

const job = new GenerateChatTitle({ chatId, messageId })

describe('ChatTitleHandler', () => {
  it.effect('handle titles the chat through the use case', () => {
    const assistant = recordAssistant({ suggestTitle: Effect.succeedSome(lisbonWeekend) })
    const handler = ChatTitleHandler.layer.pipe(
      Layer.provideMerge(ChatTitleTest),
      Layer.provide([assistant.layer, BunCrypto.layer]),
    )
    return Effect.gen(function* () {
      const titles = yield* ChatTitleHandler

      yield* insertMessage(firstMessage)

      yield* titles.handle(job)

      assertEquals(
        yield* selectChat(chatId),
        Option.some(new Chat({ ...chat, title: Option.some(lisbonWeekend) })),
      )
    }).pipe(Effect.provide(handler))
  })
})
