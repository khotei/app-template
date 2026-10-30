import { assert, describe, it } from '@effect/vitest'
import { assertEquals } from '@effect/vitest/utils'
import { Effect, Fiber, Layer, Option } from 'effect'

import {
  buildUserMessage,
  Chat,
  ChatRepository,
  ChatTitle,
  MessageRepository,
} from '@app-template/domain/chat'
import {
  type AssistantCallHold,
  chat,
  chatId,
  epoch,
  holdAssistantCall,
  messageId,
  recordAssistant,
} from '@app-template/domain/testing'
import { GenerateChatTitle } from '@app-template/infrastructure/chat'
import { recordLogs } from '@app-template/testing'

import { GenerateChatTitleUseCase } from '#application/chat/generate-chat-title.use-case'
import { ChatTitleTest, selectChat } from '#application/testing/chat.test-layer'

const lisbonWeekend = ChatTitle.make('Lisbon weekend')

const trip = ChatTitle.make('Trip')

const insertFirstMessage = MessageRepository.use((messages) =>
  messages.insert(
    buildUserMessage({ id: messageId, chatId, text: 'Plan a weekend in Lisbon', createdAt: epoch }),
  ),
)

const renameChat = ChatRepository.use((chats) =>
  chats.update({ title: Option.some(trip) }, { id: chatId }).pipe(Effect.asVoid),
)

const deleteChat = ChatRepository.use((chats) => chats.delete({ id: chatId }))

const generate = GenerateChatTitleUseCase.use((useCase) =>
  useCase.generate(new GenerateChatTitle({ chatId, messageId })),
)

const heldAnswer = (held: AssistantCallHold) =>
  Effect.andThen(held.hold, Effect.succeedSome(lisbonWeekend))

const changesWhileAnswering = [
  { name: 'renamed', change: renameChat, log: 'chat deleted or titled', title: Option.some(trip) },
  {
    name: 'deleted',
    change: deleteChat,
    log: 'chat deleted or titled',
    title: Option.none<ChatTitle>(),
  },
] as const

describe('GenerateChatTitleUseCase', () => {
  it.effect('titles an untitled chat from its first message', () => {
    const assistant = recordAssistant({ suggestTitle: Effect.succeedSome(lisbonWeekend) })
    const { logs, layer: logger } = recordLogs()
    return Effect.gen(function* () {
      yield* insertFirstMessage

      yield* generate

      assertEquals(
        yield* selectChat(chatId),
        Option.some(new Chat({ ...chat, title: Option.some(lisbonWeekend) })),
      )
      assertEquals(yield* assistant.calls, [
        { method: 'suggestTitle', text: 'Plan a weekend in Lisbon' },
      ])
      assert.deepStrictEqual(logs, [])
    }).pipe(Effect.provide([ChatTitleTest.pipe(Layer.provide(assistant.layer)), logger]))
  })

  it.effect('keeps the title the user set and logs the skip', () => {
    const assistant = recordAssistant({ suggestTitle: Effect.succeedSome(lisbonWeekend) })
    const { logs, layer: logger } = recordLogs()
    return Effect.gen(function* () {
      yield* insertFirstMessage
      yield* renameChat

      yield* generate

      assertEquals(
        yield* selectChat(chatId),
        Option.some(new Chat({ ...chat, title: Option.some(trip) })),
      )
      assert.deepStrictEqual(logs, [['Info', 'chat title skipped: chat deleted or titled']])
    }).pipe(Effect.provide([ChatTitleTest.pipe(Layer.provide(assistant.layer)), logger]))
  })

  it.effect('logs a deleted chat when its first message is gone, without asking', () => {
    const assistant = recordAssistant({ suggestTitle: Effect.succeedSome(lisbonWeekend) })
    const { logs, layer: logger } = recordLogs()
    return Effect.gen(function* () {
      yield* generate

      assertEquals(yield* assistant.calls, [])
      assert.deepStrictEqual(logs, [['Info', 'chat title skipped: chat deleted']])
    }).pipe(Effect.provide([ChatTitleTest.pipe(Layer.provide(assistant.layer)), logger]))
  })

  it.effect('leaves the chat untitled and logs the skip when the assistant answers none', () => {
    const assistant = recordAssistant({ suggestTitle: Effect.succeedNone })
    const { logs, layer: logger } = recordLogs()
    return Effect.gen(function* () {
      yield* insertFirstMessage

      yield* generate

      assertEquals(yield* selectChat(chatId), Option.some(chat))
      assert.deepStrictEqual(logs, [['Info', 'chat title skipped: nothing to title']])
    }).pipe(Effect.provide([ChatTitleTest.pipe(Layer.provide(assistant.layer)), logger]))
  })

  it.effect.each(changesWhileAnswering)(
    'skips a chat $name while the assistant answers',
    ({ change, log, title }) => {
      const held = holdAssistantCall()
      const assistant = recordAssistant({ suggestTitle: heldAnswer(held) })
      const { logs, layer: logger } = recordLogs()
      return Effect.gen(function* () {
        yield* insertFirstMessage

        const running = yield* Effect.forkChild(generate)
        yield* held.asked
        yield* change
        yield* held.release
        yield* Fiber.join(running)

        assertEquals(
          yield* selectChat(chatId),
          Option.map(title, (title) => new Chat({ ...chat, title: Option.some(title) })),
        )
        assert.deepStrictEqual(logs, [['Info', `chat title skipped: ${log}`]])
      }).pipe(Effect.provide([ChatTitleTest.pipe(Layer.provide(assistant.layer)), logger]))
    },
  )
})
