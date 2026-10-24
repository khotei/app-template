import { assert, describe, it } from '@effect/vitest'
import { Array as Arr, DateTime, Effect, Option, Order, Schema } from 'effect'

import { buildChat, Chat, ChatId, ChatRepository, ChatTitle } from '@app-template/domain/chat'
import { UserId } from '@app-template/domain/user'
import { assertSchemaEquals } from '@app-template/testing'

import { insertOwner, RepositoryStackPgTest } from '#infrastructure/testing/repository-stacks'

const createdAt = DateTime.makeUnsafe('2026-10-18T00:00:00.123Z')

const chat = (id: string, userId: UserId) => buildChat({ id: ChatId.make(id), userId, createdAt })

const byId = Order.mapInput(Order.String, (chat: Chat) => chat.id)

const SelectedChat = Schema.Option(Chat)

const Chats = Schema.Array(Chat)

describe('ChatRepositoryPg', () => {
  it.effect('selects an inserted chat back, untitled and titled', () =>
    Effect.gen(function* () {
      const chats = yield* ChatRepository
      const ada = UserId.make('0192d4e0-7b3a-7c00-8000-000000000010')
      const untitled = chat('0192d4e0-7b3a-7c00-8000-000000000030', ada)
      const titled = new Chat({
        ...chat('0192d4e0-7b3a-7c00-8000-000000000031', ada),
        title: Option.some(ChatTitle.make('Trip')),
        updatedAt: DateTime.makeUnsafe('2026-10-18T00:00:01.456Z'),
      })
      yield* insertOwner(ada)

      yield* chats.insert(untitled)
      yield* chats.insert(titled)

      assertSchemaEquals(SelectedChat, yield* chats.selectById(untitled.id), Option.some(untitled))
      assertSchemaEquals(SelectedChat, yield* chats.selectById(titled.id), Option.some(titled))
    }).pipe(Effect.provide(RepositoryStackPgTest)),
  )

  it.effect("selects only the user's chats", () =>
    Effect.gen(function* () {
      const chats = yield* ChatRepository
      const ada = UserId.make('0192d4e0-7b3a-7c00-8000-000000000010')
      const bob = UserId.make('0192d4e0-7b3a-7c00-8000-000000000011')
      const adas = [
        chat('0192d4e0-7b3a-7c00-8000-000000000031', ada),
        chat('0192d4e0-7b3a-7c00-8000-000000000030', ada),
      ]
      yield* Effect.forEach([ada, bob], insertOwner)
      yield* Effect.forEach(
        Arr.append(adas, chat('0192d4e0-7b3a-7c00-8000-000000000032', bob)),
        (each) => chats.insert(each),
      )

      const selected = yield* chats.selectByUser(ada)

      assertSchemaEquals(Chats, Arr.sort(selected, byId), Arr.sort(adas, byId))
    }).pipe(Effect.provide(RepositoryStackPgTest)),
  )

  it.effect("delete removes the chat and keeps the user's others", () =>
    Effect.gen(function* () {
      const chats = yield* ChatRepository
      const cy = UserId.make('0192d4e0-7b3a-7c00-8000-000000000012')
      const kept = chat('0192d4e0-7b3a-7c00-8000-000000000033', cy)
      const deleted = chat('0192d4e0-7b3a-7c00-8000-000000000034', cy)
      yield* insertOwner(cy)
      yield* chats.insert(kept)
      yield* chats.insert(deleted)

      yield* chats.delete(deleted.id)

      assert.deepStrictEqual(yield* chats.selectById(deleted.id), Option.none())
      assertSchemaEquals(Chats, yield* chats.selectByUser(cy), [kept])
    }).pipe(Effect.provide(RepositoryStackPgTest)),
  )

  it.effect('update renames an existing chat and never creates one', () =>
    Effect.gen(function* () {
      const chats = yield* ChatRepository
      const dee = UserId.make('0192d4e0-7b3a-7c00-8000-000000000013')
      const existing = chat('0192d4e0-7b3a-7c00-8000-000000000035', dee)
      const unknown = chat('0192d4e0-7b3a-7c00-8000-000000000036', dee)
      const renamed = new Chat({ ...existing, title: Option.some(ChatTitle.make('Trip')) })
      yield* insertOwner(dee)
      yield* chats.insert(existing)

      yield* chats.update(renamed)
      yield* chats.update(unknown)

      assertSchemaEquals(SelectedChat, yield* chats.selectById(existing.id), Option.some(renamed))
      assert.deepStrictEqual(yield* chats.selectById(unknown.id), Option.none())
      assertSchemaEquals(Chats, yield* chats.selectByUser(dee), [renamed])
    }).pipe(Effect.provide(RepositoryStackPgTest)),
  )
})
