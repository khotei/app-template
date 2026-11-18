import { BunCrypto } from '@effect/platform-bun'
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
  messageId,
  recordAssistant,
} from '@app-template/application/chat/testing'
import {
  type ChatEntitySet,
  type ChatEntityWhere,
  ChatRepository,
  FileRepository,
  MessageRepository,
} from '@app-template/kernel/data'
import { encodeRowWith } from '@app-template/packages/db'
import { epoch, recordLogs } from '@app-template/packages/testing'

import { GenerateChatTitleUseCase } from '#use-cases/chat/generate-chat-title.use-case'

/**
 * The use case over repositories that answer only the methods the case gives, and the
 * `Assistant` of `recordAssistant()`.
 */
const titleUseCaseOver = (
  assistant: ReturnType<typeof recordAssistant>,
  {
    chats = {},
    messages = {},
  }: {
    readonly chats?: Layer.PartialEffectful<ChatRepository['Service']>
    readonly messages?: Layer.PartialEffectful<MessageRepository['Service']>
  },
) =>
  GenerateChatTitleUseCase.layer.pipe(
    Layer.provide([
      assistant.layer,
      Layer.mock(ChatRepository, chats),
      Layer.mock(MessageRepository, messages),
      Layer.mock(FileRepository, {}),
      BunCrypto.layer,
    ]),
  )

/** A message read that answers `message` as its row. */
const selectsMessage = (message: Message) => () =>
  encodeRowWith(Message)(message).pipe(Effect.map(Option.some))

const lisbonWeekend = ChatTitle.make('Lisbon weekend')

const generate = GenerateChatTitleUseCase.use((useCase) =>
  useCase.generate(new GenerateChatTitle({ messageId })),
)

describe('GenerateChatTitleUseCase', () => {
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
        titleUseCaseOver(assistant, {
          messages: { selectOne: selectsMessage(firstMessage) },
          chats: {
            selectOne: () => encodeRowWith(Chat)(chat).pipe(Effect.map(Option.some)),
            update: (...update) =>
              Effect.sync(() => {
                updates.push(update)
              }),
          },
        }),
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
        titleUseCaseOver(assistant, {
          messages: { selectOne: selectsMessage(firstMessage) },
          chats: { selectOne: () => Effect.succeedNone },
        }),
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
        titleUseCaseOver(assistant, { messages: { selectOne: () => Effect.succeedNone } }),
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
        titleUseCaseOver(assistant, {
          messages: { selectOne: selectsMessage(new Message({ ...firstMessage, text: ' \n ' })) },
        }),
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
        titleUseCaseOver(assistant, { messages: { selectOne: selectsMessage(firstMessage) } }),
        logger,
      ]),
    )
  })
})
