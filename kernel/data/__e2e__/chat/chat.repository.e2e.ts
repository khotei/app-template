import { assert, describe, it } from '@effect/vitest'
import { eq } from 'drizzle-orm'
import { Effect, Exit, Layer, Option, Schema } from 'effect'

import { assertSchemaEquals } from '@app-template/testing'

import { attachments } from '#kernel/data/attachment/attachment.table'
import { ChatEntity } from '#kernel/data/chat/chat.entity'
import { ChatRepository } from '#kernel/data/chat/chat.repository'
import { MessageEntity } from '#kernel/data/chat/message.entity'
import { MessageRepository } from '#kernel/data/chat/message.repository'
import { Db } from '#kernel/data/db.client'
import { users } from '#kernel/data/user/user.table'
import { DbTest } from '#testing-e2e/data/db.test-layer'

const RepositoriesTest = Layer.mergeAll(ChatRepository.layer, MessageRepository.layer).pipe(
  Layer.provideMerge(DbTest),
)

const createdAt = new Date('2026-10-18T00:00:00.123Z')

const at = (seconds: number) => new Date(createdAt.getTime() + seconds * 1000)

const chat = (id: string, userId: string): ChatEntity => ({
  id,
  userId,
  title: null,
  status: 'idle',
  createdAt,
  updatedAt: createdAt,
  attachments: [],
})

const question = (id: string, chatId: string): MessageEntity => ({
  id,
  chatId,
  author: 'user',
  status: 'done',
  text: 'Hi',
  error: null,
  createdAt,
  updatedAt: createdAt,
  attachments: [],
})

const insertUser = (id: string) =>
  Db.use((db) => db.insert(users).values({ id, createdAt: new Date(0) }))

const SelectedChat = Schema.Option(ChatEntity)

const Messages = Schema.Array(MessageEntity)

describe('ChatRepository', () => {
  it.effect('selects an inserted chat back, untitled and titled', () =>
    Effect.gen(function* () {
      const chats = yield* ChatRepository
      const ada = '0192d4e0-7b3a-7c00-8000-000000000010'
      const untitled = chat('0192d4e0-7b3a-7c00-8000-000000000030', ada)
      const titled: ChatEntity = {
        ...chat('0192d4e0-7b3a-7c00-8000-000000000031', ada),
        title: 'Trip',
        updatedAt: new Date('2026-10-18T00:00:01.456Z'),
      }
      yield* insertUser(ada)

      yield* chats.insert(untitled)
      yield* chats.insert(titled)

      assertSchemaEquals(
        SelectedChat,
        yield* chats.selectOne({ id: untitled.id }),
        Option.some(untitled),
      )
      assertSchemaEquals(
        SelectedChat,
        yield* chats.selectOne({ id: titled.id }),
        Option.some(titled),
      )
    }).pipe(Effect.provide(RepositoriesTest)),
  )

  it.effect("selectOne finds the owner's chat; a stranger's read is none", () =>
    Effect.gen(function* () {
      const chats = yield* ChatRepository
      const ada = '0192d4e0-7b3a-7c00-8000-000000000010'
      const bob = '0192d4e0-7b3a-7c00-8000-000000000011'
      const stored = chat('0192d4e0-7b3a-7c00-8000-00000000003d', ada)
      yield* Effect.forEach([ada, bob], insertUser)
      yield* chats.insert(stored)

      const owned = yield* chats.selectOne({ id: stored.id, userId: ada })
      const foreign = yield* chats.selectOne({ id: stored.id, userId: bob })

      assertSchemaEquals(SelectedChat, owned, Option.some(stored))
      assert.deepStrictEqual(foreign, Option.none())
    }).pipe(Effect.provide(RepositoriesTest)),
  )

  it.effect("selectMany selects the user's chats, the newest created first", () =>
    Effect.gen(function* () {
      const chats = yield* ChatRepository
      const ada = '0192d4e0-7b3a-7c00-8000-000000000010'
      const bob = '0192d4e0-7b3a-7c00-8000-000000000011'
      const renamed: ChatEntity = {
        ...chat('0192d4e0-7b3a-7c00-8000-000000000031', ada),
        updatedAt: at(3),
      }
      const newer: ChatEntity = {
        ...chat('0192d4e0-7b3a-7c00-8000-000000000030', ada),
        createdAt: at(1),
        updatedAt: at(1),
      }
      yield* Effect.forEach([ada, bob], insertUser)
      yield* Effect.forEach(
        [renamed, newer, chat('0192d4e0-7b3a-7c00-8000-000000000032', bob)],
        chats.insert,
      )

      assertSchemaEquals(Schema.Array(ChatEntity), yield* chats.selectMany({ userId: ada }), [
        newer,
        renamed,
      ])
    }).pipe(Effect.provide(RepositoriesTest)),
  )

  it.effect('update where the status still holds moves it once; the second write dies', () =>
    Effect.gen(function* () {
      const chats = yield* ChatRepository
      const ada = '0192d4e0-7b3a-7c00-8000-000000000010'
      const idle = chat('0192d4e0-7b3a-7c00-8000-000000000030', ada)
      yield* insertUser(ada)
      yield* chats.insert(idle)

      const queue = chats.update({ status: 'queued' }, { id: idle.id, status: 'idle' })
      yield* queue
      const exit = yield* queue.pipe(Effect.exit)

      assert.isTrue(Exit.hasDies(exit))
      assertSchemaEquals(
        SelectedChat,
        yield* chats.selectOne({ id: idle.id }),
        Option.some({ ...idle, status: 'queued' as const }),
      )
    }).pipe(Effect.provide(RepositoriesTest)),
  )

  it.effect("delete removes the chat with its messages and keeps the user's other chats", () =>
    Effect.gen(function* () {
      const chats = yield* ChatRepository
      const messages = yield* MessageRepository
      const cy = '0192d4e0-7b3a-7c00-8000-000000000012'
      const kept = chat('0192d4e0-7b3a-7c00-8000-000000000033', cy)
      const deleted = chat('0192d4e0-7b3a-7c00-8000-000000000034', cy)
      const keptQuestion = question('0192d4e0-7b3a-7c00-8000-000000000050', kept.id)
      const deletedReply: MessageEntity = {
        ...question('0192d4e0-7b3a-7c00-8000-000000000051', deleted.id),
        author: 'assistant',
        status: 'queued',
        text: '',
      }
      yield* insertUser(cy)
      yield* Effect.forEach([kept, deleted], chats.insert)
      yield* Effect.forEach([keptQuestion, deletedReply], messages.insert)

      yield* chats.delete({ id: deleted.id, userId: cy })

      assert.deepStrictEqual(yield* chats.selectOne({ id: deleted.id }), Option.none())
      assert.deepStrictEqual(yield* messages.selectOne({ id: deletedReply.id }), Option.none())
      assertSchemaEquals(SelectedChat, yield* chats.selectOne({ id: kept.id }), Option.some(kept))
      assertSchemaEquals(Messages, yield* messages.selectMany({ chatId: kept.id }), [keptQuestion])
    }).pipe(Effect.provide(RepositoriesTest)),
  )

  it.effect("delete of an unknown chat or of another user's dies and removes nothing", () =>
    Effect.gen(function* () {
      const chats = yield* ChatRepository
      const dan = '0192d4e0-7b3a-7c00-8000-000000000015'
      const stranger = '0192d4e0-7b3a-7c00-8000-000000000016'
      const stored = chat('0192d4e0-7b3a-7c00-8000-00000000003e', dan)
      yield* Effect.forEach([dan, stranger], insertUser)
      yield* chats.insert(stored)

      const unknown = yield* chats
        .delete({ id: '0192d4e0-7b3a-7c00-8000-00000000003d' })
        .pipe(Effect.exit)
      const foreign = yield* chats.delete({ id: stored.id, userId: stranger }).pipe(Effect.exit)

      assert.isTrue(Exit.hasDies(unknown) && Exit.hasDies(foreign))
      assertSchemaEquals(
        SelectedChat,
        yield* chats.selectOne({ id: stored.id }),
        Option.some(stored),
      )
    }).pipe(Effect.provide(RepositoriesTest)),
  )

  it.effect("delete takes the messages' attachments with them by the cascade", () =>
    Effect.gen(function* () {
      const db = yield* Db
      const chats = yield* ChatRepository
      const messages = yield* MessageRepository
      const eve = '0192d4e0-7b3a-7c00-8000-000000000014'
      const stored = chat('0192d4e0-7b3a-7c00-8000-000000000037', eve)
      const withPhoto = question('0192d4e0-7b3a-7c00-8000-000000000052', stored.id)
      const attachedId = '0192d4e0-7b3a-7c00-8000-000000000020'
      yield* insertUser(eve)
      yield* chats.insert(stored)
      yield* messages.insert(withPhoto)
      yield* db.insert(attachments).values({
        id: attachedId,
        userId: eve,
        messageId: withPhoto.id,
        chatId: stored.id,
        fileName: 'photo.png',
        mediaType: 'image/png',
        size: 1024,
        createdAt,
      })

      yield* chats.delete({ id: stored.id })

      assert.deepStrictEqual(yield* messages.selectMany({ chatId: stored.id }), [])
      assert.deepStrictEqual(
        yield* db.select().from(attachments).where(eq(attachments.id, attachedId)),
        [],
      )
    }).pipe(Effect.provide(RepositoriesTest)),
  )

  it.effect('update writes only the fields it sets, keeping a title written since the read', () =>
    Effect.gen(function* () {
      const chats = yield* ChatRepository
      const fay = '0192d4e0-7b3a-7c00-8000-000000000015'
      const stored = chat('0192d4e0-7b3a-7c00-8000-000000000038', fay)
      const touchedAt = new Date('2026-10-18T00:00:05.789Z')
      yield* insertUser(fay)
      yield* chats.insert(stored)
      yield* chats.update({ title: 'Trip' }, { id: stored.id })

      yield* chats.update({ updatedAt: touchedAt }, { id: stored.id })

      assertSchemaEquals(
        SelectedChat,
        yield* chats.selectOne({ id: stored.id }),
        Option.some({ ...stored, title: 'Trip', updatedAt: touchedAt }),
      )
    }).pipe(Effect.provide(RepositoriesTest)),
  )

  it.effect('update where the chat is untitled dies on a titled one, writing nothing', () =>
    Effect.gen(function* () {
      const chats = yield* ChatRepository
      const gus = '0192d4e0-7b3a-7c00-8000-000000000016'
      const titled: ChatEntity = {
        ...chat('0192d4e0-7b3a-7c00-8000-000000000039', gus),
        title: 'Trip',
      }
      yield* insertUser(gus)
      yield* chats.insert(titled)

      const exit = yield* chats
        .update({ title: 'Lisbon' }, { id: titled.id, title: null })
        .pipe(Effect.exit)

      assert.isTrue(Exit.hasDies(exit))
      assertSchemaEquals(
        SelectedChat,
        yield* chats.selectOne({ id: titled.id }),
        Option.some(titled),
      )
    }).pipe(Effect.provide(RepositoriesTest)),
  )

  it.effect('update given a whole chat writes only the fields a set may change', () =>
    Effect.gen(function* () {
      const chats = yield* ChatRepository
      const hal = '0192d4e0-7b3a-7c00-8000-000000000017'
      const stored = chat('0192d4e0-7b3a-7c00-8000-00000000003a', hal)
      const later = new Date('2026-10-18T00:00:09.000Z')
      const whole: ChatEntity = { ...stored, title: 'Trip', createdAt: later, updatedAt: later }
      yield* insertUser(hal)
      yield* chats.insert(stored)

      yield* chats.update(whole, { id: stored.id })

      assertSchemaEquals(
        SelectedChat,
        yield* chats.selectOne({ id: stored.id }),
        Option.some({ ...stored, title: 'Trip', updatedAt: later }),
      )
    }).pipe(Effect.provide(RepositoriesTest)),
  )

  it.effect('update renames an existing chat and dies rather than create one', () =>
    Effect.gen(function* () {
      const chats = yield* ChatRepository
      const dee = '0192d4e0-7b3a-7c00-8000-000000000013'
      const existing = chat('0192d4e0-7b3a-7c00-8000-000000000035', dee)
      const unknown = chat('0192d4e0-7b3a-7c00-8000-000000000036', dee)
      yield* insertUser(dee)
      yield* chats.insert(existing)

      yield* chats.update({ title: 'Trip' }, { id: existing.id })
      const exit = yield* chats.update({ title: 'Trip' }, { id: unknown.id }).pipe(Effect.exit)

      assert.isTrue(Exit.hasDies(exit))
      assertSchemaEquals(
        SelectedChat,
        yield* chats.selectOne({ id: existing.id }),
        Option.some({ ...existing, title: 'Trip' }),
      )
      assert.deepStrictEqual(yield* chats.selectOne({ id: unknown.id }), Option.none())
    }).pipe(Effect.provide(RepositoriesTest)),
  )
})
