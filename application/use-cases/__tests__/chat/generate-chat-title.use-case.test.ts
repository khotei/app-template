import { assert, describe, it } from '@effect/vitest'
import { assertEquals } from '@effect/vitest/utils'
import { Effect, Layer, Option } from 'effect'

import { ChatTitle, GenerateChatTitle, Message } from '@app-template/application/chat'
import {
  firstMessage,
  layerChatTest,
  messageId,
  recordChatAssistant,
} from '@app-template/application/chat/testing'
import { LlmError } from '@app-template/kernel/llm/error'
import { encodeWith } from '@app-template/packages/schema'
import { recordLogs } from '@app-template/packages/testing'

import { generateChatTitle } from '#use-cases/chat/generate-chat-title.use-case'

/** A message read that returns `message` as its row. */
const selectsMessage = (message: Message) => () =>
  encodeWith(Message)(message).pipe(Effect.map(Option.some))

const lisbonWeekend = ChatTitle.make('Lisbon weekend')

const generate = generateChatTitle(new GenerateChatTitle({ messageId }))

describe('generateChatTitle', () => {
  it.effect('skips a chat the store finds titled or gone by the rename, and logs it', () => {
    const assistant = recordChatAssistant(Effect.succeed(lisbonWeekend))
    const { logs, layer: logger } = recordLogs()
    return Effect.gen(function* () {
      yield* generate

      assert.deepStrictEqual(logs, [['Info', 'chat title skipped: chat deleted or titled']])
    }).pipe(
      Effect.provide([
        layerChatTest({
          messages: { selectOne: selectsMessage(firstMessage) },
          chats: { selectOne: () => Effect.succeedNone },
        }).pipe(Layer.provideMerge(assistant.layer)),
        logger,
      ]),
    )
  })

  it.effect('logs a deleted chat when its first message is gone, without asking', () => {
    const assistant = recordChatAssistant(Effect.succeed(lisbonWeekend))
    const { logs, layer: logger } = recordLogs()
    return Effect.gen(function* () {
      yield* generate

      assertEquals(yield* assistant.texts, [])
      assert.deepStrictEqual(logs, [['Info', 'chat title skipped: chat deleted']])
    }).pipe(
      Effect.provide([
        layerChatTest({ messages: { selectOne: () => Effect.succeedNone } }).pipe(
          Layer.provideMerge(assistant.layer),
        ),
        logger,
      ]),
    )
  })

  it.effect("leaves the chat untitled and logs the LlmError with the job's message", () => {
    const error = new LlmError({ cause: '529 overloaded' })
    const assistant = recordChatAssistant(Effect.fail(error))
    const { logs, layer: logger } = recordLogs('messageId')
    return Effect.gen(function* () {
      yield* generate

      assert.deepStrictEqual(logs, [
        ['Warn', 'chat title skipped: the assistant failed', messageId, error],
      ])
    }).pipe(
      Effect.provide([
        layerChatTest({ messages: { selectOne: selectsMessage(firstMessage) } }).pipe(
          Layer.provideMerge(assistant.layer),
        ),
        logger,
      ]),
    )
  })
})
