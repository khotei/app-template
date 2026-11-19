import { assert, describe, it } from '@effect/vitest'
import { assertEquals } from '@effect/vitest/utils'
import { DateTime, Effect, Layer, Option } from 'effect'

import {
  AssistantFailedError,
  AssistantRefusedError,
  Chat,
  ChatTitle,
  GenerateChatTitle,
  Message,
} from '@app-template/application/chat'
import {
  chat,
  chatId,
  firstMessage,
  layerChatTest,
  messageId,
  recordAssistant,
} from '@app-template/application/chat/testing'
import type { ChatEntitySet, ChatEntityWhere } from '@app-template/kernel/data'
import { encodeRowWith } from '@app-template/packages/db'
import { epoch, recordLogs } from '@app-template/packages/testing'

import { generateChatTitle } from '#use-cases/chat/generate-chat-title.use-case'

/** A message read that answers `message` as its row. */
const selectsMessage = (message: Message) => () =>
  encodeRowWith(Message)(message).pipe(Effect.map(Option.some))

const lisbonWeekend = ChatTitle.make('Lisbon weekend')

const generate = generateChatTitle(new GenerateChatTitle({ messageId }))

describe('generateChatTitle', () => {
  it.effect('titles the chat of its first message while the chat is untitled', () => {
    const assistant = recordAssistant({ suggestTitle: Effect.succeed(lisbonWeekend) })
    const { logs, layer: logger } = recordLogs()
    const updates: Array<readonly [ChatEntitySet, ChatEntityWhere]> = []
    return Effect.gen(function* () {
      yield* generate

      assert.deepStrictEqual(updates, [
        [
          { title: lisbonWeekend, updatedAt: DateTime.toDateUtc(epoch) },
          { id: chatId, title: null },
        ],
      ])
      assertEquals(yield* assistant.calls, [
        { method: 'suggestTitle', text: 'Plan a weekend in Lisbon' },
      ])
      assert.deepStrictEqual(logs, [])
    }).pipe(
      Effect.provide([
        layerChatTest({
          messages: { selectOne: selectsMessage(firstMessage) },
          chats: {
            selectOne: () => encodeRowWith(Chat)(chat).pipe(Effect.map(Option.some)),
            update: (...update) =>
              Effect.sync(() => {
                updates.push(update)
              }),
          },
        }).pipe(Layer.provideMerge(assistant.layer)),
        logger,
      ]),
    )
  })

  it.effect('skips a chat the store finds titled or gone by the rename, and logs it', () => {
    const assistant = recordAssistant({ suggestTitle: Effect.succeed(lisbonWeekend) })
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
    const assistant = recordAssistant({ suggestTitle: Effect.succeed(lisbonWeekend) })
    const { logs, layer: logger } = recordLogs()
    return Effect.gen(function* () {
      yield* generate

      assertEquals(yield* assistant.calls, [])
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

  it.effect('leaves the chat untitled when its first message is blank, without asking', () => {
    const assistant = recordAssistant({ suggestTitle: Effect.succeed(lisbonWeekend) })
    const { logs, layer: logger } = recordLogs()
    return Effect.gen(function* () {
      yield* generate

      assertEquals(yield* assistant.calls, [])
      assert.deepStrictEqual(logs, [['Info', 'chat title skipped: nothing to title']])
    }).pipe(
      Effect.provide([
        layerChatTest({
          messages: { selectOne: selectsMessage(new Message({ ...firstMessage, text: ' \n ' })) },
        }).pipe(Layer.provideMerge(assistant.layer)),
        logger,
      ]),
    )
  })

  it.effect.each([
    { error: new AssistantRefusedError({ cause: 'stop_reason refusal' }) },
    { error: new AssistantFailedError({ cause: '529 overloaded' }) },
  ])('leaves the chat untitled and logs the $error._tag', ({ error }) => {
    const assistant = recordAssistant({ suggestTitle: Effect.fail(error) })
    const { logs, layer: logger } = recordLogs('error', 'cause')
    return Effect.gen(function* () {
      yield* generate

      assert.deepStrictEqual(logs, [
        ['Warn', 'chat title skipped: the assistant failed', error._tag, error.cause],
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
