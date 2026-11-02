import { assert, describe, it } from '@effect/vitest'
import { assertEquals } from '@effect/vitest/utils'
import { Effect, Layer, Option } from 'effect'

import { Chat, ChatTitle } from '@app-template/chat/domain'
import { GenerateChatTitle } from '@app-template/chat/services'
import {
  chat,
  chatId,
  firstMessage,
  insertMessage,
  messageId,
  recordAssistant,
  selectChat,
} from '@app-template/chat/testing'
import { recordLogs } from '@app-template/packages/testing'
import { ChatTitleTest } from '@app-template/use-cases/testing'

import { handle, handleDeadLettered } from '#worker/chat/chat-title.handler'

const lisbonWeekend = ChatTitle.make('Lisbon weekend')

const job = new GenerateChatTitle({ chatId, messageId })

describe('ChatTitleHandler', () => {
  it.effect('handle titles the chat through the use case', () => {
    const assistant = recordAssistant({ suggestTitle: Effect.succeedSome(lisbonWeekend) })
    return Effect.gen(function* () {
      yield* insertMessage(firstMessage)

      yield* handle(job)

      assertEquals(
        yield* selectChat(chatId),
        Option.some(new Chat({ ...chat, title: Option.some(lisbonWeekend) })),
      )
    }).pipe(Effect.provide(Layer.provide(ChatTitleTest, assistant.layer)))
  })

  it.effect('handleDeadLettered logs the job at Error', () => {
    const { logs, layer } = recordLogs()
    return Effect.gen(function* () {
      yield* handleDeadLettered()

      assert.deepStrictEqual(logs, [['Error', 'chat title dead-lettered']])
    }).pipe(Effect.provide(layer))
  })
})
