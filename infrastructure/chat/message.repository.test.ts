import { assert, describe, layer } from '@effect/vitest'
import { Array as Arr, DateTime, Effect, Layer, Option } from 'effect'
import { KeyValueStore } from 'effect/persistence'

import {
  buildAssistantMessage,
  buildUserMessage,
  ChatId,
  completeMessage,
  MessageId,
  MessageRepository,
} from '@app-template/domain/chat'

import { MessageRepositoryKv } from '#infrastructure/chat/message.repository'

// Every message shares one millisecond, so only the index can order them.
const createdAt = DateTime.makeUnsafe('2026-10-18T00:00:00.000Z')

const userMessage = (id: string, chatId: ChatId) =>
  buildUserMessage({ id: MessageId.make(id), chatId, text: 'Hi', attachmentIds: [], createdAt })

const assistantMessage = (id: string, chatId: ChatId) =>
  buildAssistantMessage({ id: MessageId.make(id), chatId, createdAt })

describe('MessageRepositoryKv', () => {
  layer(MessageRepositoryKv.pipe(Layer.provideMerge(KeyValueStore.layerMemory)))((it) => {
    it.effect("selects the chat's messages in insertion order, not id order", () =>
      Effect.gen(function* () {
        const messages = yield* MessageRepository
        const chatId = ChatId.make('0192d4e0-7b3a-7c00-8000-000000000040')
        const other = ChatId.make('0192d4e0-7b3a-7c00-8000-000000000041')
        const question = userMessage('0192d4e0-7b3a-7c00-8000-000000000052', chatId)
        const reply = assistantMessage('0192d4e0-7b3a-7c00-8000-000000000051', chatId)
        yield* Effect.forEach(
          [question, userMessage('0192d4e0-7b3a-7c00-8000-000000000050', other), reply],
          (each) => messages.insert(each),
        )

        assert.deepStrictEqual(yield* messages.selectByChat(chatId), [question, reply])
      }),
    )

    it.effect('selects a queued assistant message as active, and none once it completes', () =>
      Effect.gen(function* () {
        const messages = yield* MessageRepository
        const chatId = ChatId.make('0192d4e0-7b3a-7c00-8000-000000000042')
        const queued = assistantMessage('0192d4e0-7b3a-7c00-8000-000000000054', chatId)
        yield* messages.insert(userMessage('0192d4e0-7b3a-7c00-8000-000000000053', chatId))
        yield* messages.insert(queued)

        assert.deepStrictEqual(yield* messages.selectActiveByChat(chatId), Option.some(queued))

        yield* messages.update(yield* completeMessage(queued, { text: 'Hello', at: createdAt }))

        assert.deepStrictEqual(yield* messages.selectActiveByChat(chatId), Option.none())
      }),
    )

    it.effect("selects none as active when the last message is the user's", () =>
      Effect.gen(function* () {
        const messages = yield* MessageRepository
        const chatId = ChatId.make('0192d4e0-7b3a-7c00-8000-000000000043')
        yield* messages.insert(userMessage('0192d4e0-7b3a-7c00-8000-000000000055', chatId))

        assert.deepStrictEqual(yield* messages.selectActiveByChat(chatId), Option.none())
        assert.deepStrictEqual(
          yield* messages.selectActiveByChat(ChatId.make('0192d4e0-7b3a-7c00-8000-000000000049')),
          Option.none(),
        )
      }),
    )

    it.effect("deleteByChat removes every message of the chat and the chat's index", () =>
      Effect.gen(function* () {
        const messages = yield* MessageRepository
        const chatId = ChatId.make('0192d4e0-7b3a-7c00-8000-000000000044')
        const other = ChatId.make('0192d4e0-7b3a-7c00-8000-000000000045')
        const deleted = [
          userMessage('0192d4e0-7b3a-7c00-8000-000000000056', chatId),
          assistantMessage('0192d4e0-7b3a-7c00-8000-000000000057', chatId),
        ]
        const kept = userMessage('0192d4e0-7b3a-7c00-8000-000000000058', other)
        yield* Effect.forEach(Arr.append(deleted, kept), messages.insert)

        yield* messages.deleteByChat(chatId)

        const afterDelete = yield* Effect.forEach(deleted, (each) => messages.selectById(each.id))
        assert.deepStrictEqual(
          afterDelete,
          Arr.map(deleted, () => Option.none()),
        )
        assert.isFalse(yield* (yield* KeyValueStore.KeyValueStore).has(`chats/${chatId}/messages`))
        assert.deepStrictEqual(yield* messages.selectByChat(other), [kept])
      }),
    )

    it.effect('update rewrites a message in place, never creating one or touching the index', () =>
      Effect.gen(function* () {
        const messages = yield* MessageRepository
        const chatId = ChatId.make('0192d4e0-7b3a-7c00-8000-000000000046')
        const queued = assistantMessage('0192d4e0-7b3a-7c00-8000-000000000059', chatId)
        const unknown = assistantMessage('0192d4e0-7b3a-7c00-8000-00000000005a', chatId)
        yield* messages.insert(queued)
        const completed = yield* completeMessage(queued, { text: 'Hello', at: createdAt })

        yield* messages.update(completed)
        yield* messages.update(unknown)

        assert.deepStrictEqual(yield* messages.selectByChat(chatId), [completed])
        assert.deepStrictEqual(yield* messages.selectById(unknown.id), Option.none())
        assert.strictEqual(
          yield* (yield* KeyValueStore.KeyValueStore).get(`chats/${chatId}/messages`),
          JSON.stringify([queued.id]),
        )
      }),
    )
  })
})
