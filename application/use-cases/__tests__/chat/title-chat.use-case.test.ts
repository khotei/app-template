import { assert, describe, it } from '@effect/vitest'
import { assertEquals } from '@effect/vitest/utils'
import { Effect } from 'effect'

import { ChatTitle, Message, TitleChat } from '@app-template/application/chat'
import {
  chatId,
  firstMessage,
  layerChatTest,
  recordChatAssistant,
} from '@app-template/application/chat/testing'
import { LlmError } from '@app-template/kernel/llm/error'
import { encodeWith } from '@app-template/packages/schema'
import { recordLogs } from '@app-template/packages/testing'

import { titleChat } from '#use-cases/chat/title-chat.use-case'

/** A message read that returns the chat's messages as `firstMessage` alone. */
const selectsFirstMessage = () =>
  Effect.forEach([firstMessage], (message) => encodeWith(Message)(message))

const lisbonWeekend = ChatTitle.make('Lisbon weekend')

const title = titleChat(new TitleChat({ chatId }))

describe('titleChat', () => {
  it.effect('skips a chat the store finds titled or gone by the rename, and logs it', () => {
    const assistant = recordChatAssistant(Effect.succeed(lisbonWeekend))
    const { logs, layer: logger } = recordLogs()
    return Effect.gen(function* () {
      yield* title

      assert.deepStrictEqual(logs, [['Info', 'title skipped: chat deleted or titled']])
    }).pipe(
      Effect.provide([
        layerChatTest(
          {
            messages: { selectMany: selectsFirstMessage },
            chats: { selectOne: () => Effect.succeedNone },
          },
          { chatAssistant: assistant.layer },
        ),
        logger,
      ]),
    )
  })

  it.effect('logs a chat gone when it holds no message, without asking', () => {
    const assistant = recordChatAssistant(Effect.succeed(lisbonWeekend))
    const { logs, layer: logger } = recordLogs()
    return Effect.gen(function* () {
      yield* title

      assertEquals(yield* assistant.texts, [])
      assert.deepStrictEqual(logs, [['Info', 'title skipped: chat deleted or titled']])
    }).pipe(
      Effect.provide([
        layerChatTest(
          { messages: { selectMany: () => Effect.succeed([]) } },
          { chatAssistant: assistant.layer },
        ),
        logger,
      ]),
    )
  })

  it.effect("leaves the chat untitled and logs the LlmError with the job's chat", () => {
    const error = new LlmError({ cause: '529 overloaded' })
    const assistant = recordChatAssistant(Effect.fail(error))
    const { logs, layer: logger } = recordLogs('chatId')
    return Effect.gen(function* () {
      yield* title

      assert.deepStrictEqual(logs, [['Warn', 'title skipped: the assistant failed', chatId, error]])
    }).pipe(
      Effect.provide([
        layerChatTest(
          { messages: { selectMany: selectsFirstMessage } },
          { chatAssistant: assistant.layer },
        ),
        logger,
      ]),
    )
  })
})
