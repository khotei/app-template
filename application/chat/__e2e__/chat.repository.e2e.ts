import { assert, describe, it } from '@effect/vitest'
import { DateTime, Effect, Exit, Layer, Option, Schema } from 'effect'
import { Model } from 'effect/schema'
import { SqlClient } from 'effect/sql'

import { UserId } from '@app-template/application/identity'
import { PgClientTest } from '@app-template/packages/db/testing/e2e'
import { assertSchemaEquals } from '@app-template/packages/testing'

import { Chat, ChatFields, ChatTitle } from '#chat/domain/chat.model'
import { ChatId } from '#chat/domain/chat.util'
import { Message, MessageFields } from '#chat/domain/message.model'
import { MessageId } from '#chat/domain/message.util'
import { RunId } from '#chat/domain/run.util'
import { RunFields } from '#chat/domain/run-fields.model'
import { ChatRepository } from '#chat/services/chat.repository'
import { MessageRepository } from '#chat/services/message.repository'
import { RunRepository } from '#chat/services/run.repository'

const RepositoriesTest = Layer.mergeAll(
  ChatRepository.layer,
  MessageRepository.layer,
  RunRepository.layer,
).pipe(Layer.provideMerge(PgClientTest))

const createdAt = DateTime.makeUnsafe('2026-10-18T00:00:00.123Z')

const at = (seconds: number) => Model.Override(DateTime.add(createdAt, { seconds }))

const trip = ChatTitle.make('Trip')

const chat = (id: string, userId: string) =>
  ChatFields.insert.make({
    id: ChatId.make(id),
    userId: UserId.make(userId),
    createdAt: at(0),
    updatedAt: at(0),
  })

/** `row` as a read returns it, with `run` its newest Run. */
const read = (row: typeof ChatFields.insert.Type, run: Option.Option<RunFields> = Option.none()) =>
  new Chat({ ...row, run })

const question = (id: string, chatId: string) =>
  MessageFields.insert.make({
    id: MessageId.make(id),
    chatId: ChatId.make(chatId),
    author: 'user',
    text: 'Hi',
    createdAt: at(0),
  })

const run = (
  id: string,
  answered: typeof MessageFields.insert.Type,
  {
    status = 'queued',
    seconds = 0,
  }: Partial<{ status: 'queued' | 'failed'; seconds: number }> = {},
) =>
  RunFields.insert.make({
    id: RunId.make(id),
    chatId: answered.chatId,
    userMessageId: answered.id,
    status,
    failure: status === 'failed' ? Option.some({ cause: '529 overloaded' }) : Option.none(),
    createdAt: at(seconds),
    updatedAt: at(seconds),
  })

const insertUser = (id: string) =>
  SqlClient.SqlClient.use(
    (sql) =>
      sql`insert into users ${sql.insert({ id, createdAt: DateTime.toDateUtc(DateTime.makeUnsafe(0)) })}`,
  )

const SelectedChat = Schema.Option(Chat)

const Messages = Schema.Array(Message)

describe('ChatRepository', () => {
  it.effect('selects an inserted chat back, untitled and titled', () =>
    Effect.gen(function* () {
      const chats = yield* ChatRepository
      const ada = '0192d4e0-7b3a-7c00-8000-000000000010'
      const untitled = chat('0192d4e0-7b3a-7c00-8000-000000000030', ada)
      const titled = {
        ...chat('0192d4e0-7b3a-7c00-8000-000000000031', ada),
        title: Option.some(trip),
        updatedAt: Model.Override(DateTime.makeUnsafe('2026-10-18T00:00:01.456Z')),
      }
      yield* insertUser(ada)

      yield* chats.insert(untitled)
      yield* chats.insert(titled)

      assertSchemaEquals(
        SelectedChat,
        yield* chats.selectOne({ id: untitled.id }),
        Option.some(read(untitled)),
      )
      assertSchemaEquals(
        SelectedChat,
        yield* chats.selectOne({ id: titled.id }),
        Option.some(read(titled)),
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

      const owned = yield* chats.selectOne({ id: stored.id, userId: UserId.make(ada) })
      const foreign = yield* chats.selectOne({ id: stored.id, userId: UserId.make(bob) })

      assertSchemaEquals(SelectedChat, owned, Option.some(read(stored)))
      assert.deepStrictEqual(foreign, Option.none())
    }).pipe(Effect.provide(RepositoriesTest)),
  )

  it.effect('selectOne where the title is none reads a titled chat as none', () =>
    Effect.gen(function* () {
      const chats = yield* ChatRepository
      const hal = '0192d4e0-7b3a-7c00-8000-000000000018'
      const titled = {
        ...chat('0192d4e0-7b3a-7c00-8000-00000000003b', hal),
        title: Option.some(trip),
      }
      yield* insertUser(hal)
      yield* chats.insert(titled)

      assert.deepStrictEqual(
        yield* chats.selectOne({ id: titled.id, title: Option.none() }),
        Option.none(),
      )
    }).pipe(Effect.provide(RepositoriesTest)),
  )

  it.effect("selectMany selects the user's chats, the newest created first", () =>
    Effect.gen(function* () {
      const chats = yield* ChatRepository
      const ada = '0192d4e0-7b3a-7c00-8000-000000000010'
      const bob = '0192d4e0-7b3a-7c00-8000-000000000011'
      const renamed = { ...chat('0192d4e0-7b3a-7c00-8000-000000000031', ada), updatedAt: at(3) }
      const newer = {
        ...chat('0192d4e0-7b3a-7c00-8000-000000000030', ada),
        createdAt: at(1),
        updatedAt: at(1),
      }
      yield* Effect.forEach([ada, bob], insertUser)
      yield* Effect.forEach(
        [renamed, newer, chat('0192d4e0-7b3a-7c00-8000-000000000032', bob)],
        chats.insert,
      )

      assertSchemaEquals(
        Schema.Array(Chat),
        yield* chats.selectMany({ userId: UserId.make(ada) }),
        [read(newer), read(renamed)],
      )
    }).pipe(Effect.provide(RepositoriesTest)),
  )

  it.effect('selectMany orders chats created in one instant by id, the greater first', () =>
    Effect.gen(function* () {
      const chats = yield* ChatRepository
      const ada = '0192d4e0-7b3a-7c00-8000-000000000010'
      const lesser = chat('0192d4e0-7b3a-7c00-8000-000000000030', ada)
      const greater = chat('0192d4e0-7b3a-7c00-8000-000000000031', ada)
      yield* insertUser(ada)
      yield* Effect.forEach([lesser, greater], chats.insert)

      assertSchemaEquals(
        Schema.Array(Chat),
        yield* chats.selectMany({ userId: UserId.make(ada) }),
        [read(greater), read(lesser)],
      )
    }).pipe(Effect.provide(RepositoriesTest)),
  )

  it.effect('selects a chat with its newest Run', () =>
    Effect.gen(function* () {
      const chats = yield* ChatRepository
      const messages = yield* MessageRepository
      const runs = yield* RunRepository
      const ada = '0192d4e0-7b3a-7c00-8000-000000000010'
      const asked = chat('0192d4e0-7b3a-7c00-8000-000000000030', ada)
      const first = question('0192d4e0-7b3a-7c00-8000-000000000050', asked.id)
      const older = run('0192d4e0-7b3a-7c00-8000-000000000060', first, { status: 'failed' })
      const newer = run('0192d4e0-7b3a-7c00-8000-000000000061', first, { seconds: 1 })
      yield* insertUser(ada)
      yield* chats.insert(asked)
      yield* messages.insert(first)
      yield* Effect.forEach([newer, older], runs.insert)

      assertSchemaEquals(
        SelectedChat,
        yield* chats.selectOne({ id: asked.id }),
        Option.some(read(asked, Option.some(new RunFields(newer)))),
      )
    }).pipe(Effect.provide(RepositoriesTest)),
  )

  it.effect("delete removes the chat with its messages and keeps the user's other chats", () =>
    Effect.gen(function* () {
      const chats = yield* ChatRepository
      const messages = yield* MessageRepository
      const runs = yield* RunRepository
      const cy = '0192d4e0-7b3a-7c00-8000-000000000012'
      const kept = chat('0192d4e0-7b3a-7c00-8000-000000000033', cy)
      const deleted = chat('0192d4e0-7b3a-7c00-8000-000000000034', cy)
      const keptQuestion = question('0192d4e0-7b3a-7c00-8000-000000000050', kept.id)
      const deletedQuestion = question('0192d4e0-7b3a-7c00-8000-000000000051', deleted.id)
      const deletedRun = run('0192d4e0-7b3a-7c00-8000-000000000060', deletedQuestion)
      yield* insertUser(cy)
      yield* Effect.forEach([kept, deleted], chats.insert)
      yield* Effect.forEach([keptQuestion, deletedQuestion], messages.insert)
      yield* runs.insert(deletedRun)

      yield* chats.delete({ id: deleted.id, userId: UserId.make(cy) })

      assert.deepStrictEqual(yield* chats.selectOne({ id: deleted.id }), Option.none())
      assert.deepStrictEqual(yield* messages.selectOne({ id: deletedQuestion.id }), Option.none())
      assert.deepStrictEqual(yield* runs.selectOne({ id: deletedRun.id }), Option.none())
      assertSchemaEquals(
        SelectedChat,
        yield* chats.selectOne({ id: kept.id }),
        Option.some(read(kept)),
      )
      assertSchemaEquals(Messages, yield* messages.selectMany({ chatId: kept.id }), [
        new Message(keptQuestion),
      ])
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
        .delete({ id: ChatId.make('0192d4e0-7b3a-7c00-8000-00000000003d') })
        .pipe(Effect.exit)
      const foreign = yield* chats
        .delete({ id: stored.id, userId: UserId.make(stranger) })
        .pipe(Effect.exit)

      assert.isTrue(Exit.hasDies(unknown) && Exit.hasDies(foreign))
      assertSchemaEquals(
        SelectedChat,
        yield* chats.selectOne({ id: stored.id }),
        Option.some(read(stored)),
      )
    }).pipe(Effect.provide(RepositoriesTest)),
  )

  it.effect(
    'update writes the update variant alone: the title and updatedAt, never createdAt',
    () =>
      Effect.gen(function* () {
        const chats = yield* ChatRepository
        const hal = '0192d4e0-7b3a-7c00-8000-000000000017'
        const stored = chat('0192d4e0-7b3a-7c00-8000-00000000003a', hal)
        const later = Model.Override(DateTime.makeUnsafe('2026-10-18T00:00:09.000Z'))
        const whole = { ...stored, title: Option.some(trip), createdAt: later, updatedAt: later }
        yield* insertUser(hal)
        yield* chats.insert(stored)

        yield* chats.update(whole, { id: stored.id })

        assertSchemaEquals(
          SelectedChat,
          yield* chats.selectOne({ id: stored.id }),
          Option.some(read({ ...stored, title: Option.some(trip), updatedAt: later })),
        )
      }).pipe(Effect.provide(RepositoriesTest)),
  )

  it.effect('update where the chat is untitled dies on a titled one, writing nothing', () =>
    Effect.gen(function* () {
      const chats = yield* ChatRepository
      const gus = '0192d4e0-7b3a-7c00-8000-000000000016'
      const titled = {
        ...chat('0192d4e0-7b3a-7c00-8000-000000000039', gus),
        title: Option.some(trip),
      }
      yield* insertUser(gus)
      yield* chats.insert(titled)

      const exit = yield* chats
        .update(
          { ...titled, title: Option.some(ChatTitle.make('Lisbon')) },
          { id: titled.id, title: Option.none() },
        )
        .pipe(Effect.exit)

      assert.isTrue(Exit.hasDies(exit))
      assertSchemaEquals(
        SelectedChat,
        yield* chats.selectOne({ id: titled.id }),
        Option.some(read(titled)),
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

      yield* chats.update({ ...existing, title: Option.some(trip) }, { id: existing.id })
      const exit = yield* chats
        .update({ ...unknown, title: Option.some(trip) }, { id: unknown.id })
        .pipe(Effect.exit)

      assert.isTrue(Exit.hasDies(exit))
      assertSchemaEquals(
        SelectedChat,
        yield* chats.selectOne({ id: existing.id }),
        Option.some(read({ ...existing, title: Option.some(trip) })),
      )
      assert.deepStrictEqual(yield* chats.selectOne({ id: unknown.id }), Option.none())
    }).pipe(Effect.provide(RepositoriesTest)),
  )
})
