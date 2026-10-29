import { assert, describe, it } from '@effect/vitest'
import { assertEquals } from '@effect/vitest/utils'
import { Effect, Layer, Option } from 'effect'

import { ChatTitleTest, selectChat } from '@app-template/application/testing'
import { buildUserMessage, Chat, ChatTitle, MessageRepository } from '@app-template/domain/chat'
import { chat, chatId, epoch, messageId, recordAssistant } from '@app-template/domain/testing'
import { GenerateChatTitle } from '@app-template/infrastructure/chat'
import { recordLogs } from '@app-template/testing'

import { handle, handleDeadLettered } from '#worker/chat/chat-title.handler'

const lisbonWeekend = ChatTitle.make('Lisbon weekend')

const insertFirstMessage = Effect.flatMap(MessageRepository, (messages) =>
  messages.insert(
    buildUserMessage({ id: messageId, chatId, text: 'Plan a weekend in Lisbon', createdAt: epoch }),
  ),
)

const job = new GenerateChatTitle({ chatId, messageId })

describe('ChatTitleHandler', () => {
  it.effect('handle titles the chat through the use case', () => {
    const assistant = recordAssistant({ suggestTitle: Effect.succeedSome(lisbonWeekend) })
    return Effect.gen(function* () {
      yield* insertFirstMessage

      yield* handle(job)

      assertEquals(
        yield* selectChat(chatId),
        Option.some(new Chat({ ...chat, title: Option.some(lisbonWeekend) })),
      )
    }).pipe(Effect.provide(ChatTitleTest.pipe(Layer.provide(assistant.layer))))
  })

  it.effect('handleDeadLettered logs the job at Error', () => {
    const { logs, layer } = recordLogs()
    return Effect.gen(function* () {
      yield* handleDeadLettered()

      assert.deepStrictEqual(logs, [['Error', 'chat title dead-lettered']])
    }).pipe(Effect.provide(layer))
  })
})
