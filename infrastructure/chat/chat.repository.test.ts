import { assert, describe, layer } from '@effect/vitest'
import { Array as Arr, DateTime, Effect, Layer, Option, Order } from 'effect'
import { KeyValueStore } from 'effect/persistence'

import { buildChat, Chat, ChatId, ChatRepository } from '@app-template/domain/chat'
import { UserId } from '@app-template/domain/user'

import { ChatRepositoryKv } from '#infrastructure/chat/chat.repository'

const createdAt = DateTime.makeUnsafe('2026-10-18T00:00:00.000Z')

const chat = (id: string, userId: UserId) => buildChat({ id: ChatId.make(id), userId, createdAt })

const byId = Order.mapInput(Order.String, (chat: Chat) => chat.id)

describe('ChatRepositoryKv', () => {
  layer(ChatRepositoryKv.pipe(Layer.provideMerge(KeyValueStore.layerMemory)))((it) => {
    it.effect("selects only the user's chats", () =>
      Effect.gen(function* () {
        const chats = yield* ChatRepository
        const ada = UserId.make('0192d4e0-7b3a-7c00-8000-000000000010')
        const bob = UserId.make('0192d4e0-7b3a-7c00-8000-000000000011')
        const adas = [
          chat('0192d4e0-7b3a-7c00-8000-000000000031', ada),
          chat('0192d4e0-7b3a-7c00-8000-000000000030', ada),
        ]
        yield* Effect.forEach(
          Arr.append(adas, chat('0192d4e0-7b3a-7c00-8000-000000000032', bob)),
          (each) => chats.insert(each),
        )

        const selected = yield* chats.selectByUser(ada)

        assert.deepStrictEqual(Arr.sort(selected, byId), Arr.sort(adas, byId))
      }),
    )

    it.effect("delete removes the chat and its entry in the user's index", () =>
      Effect.gen(function* () {
        const chats = yield* ChatRepository
        const cy = UserId.make('0192d4e0-7b3a-7c00-8000-000000000012')
        const kept = chat('0192d4e0-7b3a-7c00-8000-000000000033', cy)
        const deleted = chat('0192d4e0-7b3a-7c00-8000-000000000034', cy)
        yield* chats.insert(kept)
        yield* chats.insert(deleted)

        yield* chats.delete(deleted.id)

        assert.deepStrictEqual(yield* chats.selectById(deleted.id), Option.none())
        assert.deepStrictEqual(
          yield* (yield* KeyValueStore.KeyValueStore).get(`users/${cy}/chats`),
          JSON.stringify([kept.id]),
        )
      }),
    )

    it.effect('update renames an existing chat and never creates one', () =>
      Effect.gen(function* () {
        const chats = yield* ChatRepository
        const dee = UserId.make('0192d4e0-7b3a-7c00-8000-000000000013')
        const existing = chat('0192d4e0-7b3a-7c00-8000-000000000035', dee)
        const unknown = chat('0192d4e0-7b3a-7c00-8000-000000000036', dee)
        const renamed = new Chat({ ...existing, title: Option.some('Trip') })
        yield* chats.insert(existing)

        yield* chats.update(renamed)
        yield* chats.update(unknown)

        assert.deepStrictEqual(yield* chats.selectById(existing.id), Option.some(renamed))
        assert.deepStrictEqual(yield* chats.selectById(unknown.id), Option.none())
        assert.deepStrictEqual(yield* chats.selectByUser(dee), [renamed])
      }),
    )
  })
})
