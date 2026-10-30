import { assert, describe, it } from '@effect/vitest'
import { DateTime, Effect, Exit, Option, Schema } from 'effect'

import {
  Attachment,
  AttachmentId,
  AttachmentRepository,
  buildAttachment,
  FileName,
  FileSize,
  MediaType,
} from '@app-template/domain/attachment'
import {
  buildAssistantMessage,
  buildChat,
  buildUserMessage,
  Chat,
  ChatId,
  ChatRepository,
  ChatTitle,
  Message,
  MessageId,
  MessageRepository,
} from '@app-template/domain/chat'
import { UserId } from '@app-template/domain/user'
import { assertSchemaEquals } from '@app-template/testing'

import { RepositoryStackPgTest } from '#infrastructure/testing/repository-stack.test-layer'
import { insertUser } from '#infrastructure/testing/rows.test-util'

const createdAt = DateTime.makeUnsafe('2026-10-18T00:00:00.123Z')

const chat = (id: string, userId: UserId) => buildChat({ id: ChatId.make(id), userId, createdAt })

const at = (seconds: number) => DateTime.add(createdAt, { seconds })

const question = (id: string, chatId: ChatId) =>
  buildUserMessage({ id: MessageId.make(id), chatId, text: 'Hi', createdAt })

const photo = (
  id: string,
  { userId, message, seconds }: { userId: UserId; message: Message; seconds: number },
) =>
  new Attachment({
    ...buildAttachment({
      id: AttachmentId.make(id),
      userId,
      fileName: FileName.make('photo.png'),
      mediaType: MediaType.make('image/png'),
      size: FileSize.make(1024),
      createdAt: at(seconds),
    }),
    messageId: Option.some(message.id),
    chatId: Option.some(message.chatId),
  })

const SelectedChat = Schema.Option(Chat)

const Messages = Schema.Array(Message)

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
    }).pipe(Effect.provide(RepositoryStackPgTest)),
  )

  it.effect("selectOne finds the owner's chat; a stranger's read is none", () =>
    Effect.gen(function* () {
      const chats = yield* ChatRepository
      const ada = UserId.make('0192d4e0-7b3a-7c00-8000-000000000010')
      const bob = UserId.make('0192d4e0-7b3a-7c00-8000-000000000011')
      const stored = chat('0192d4e0-7b3a-7c00-8000-00000000003d', ada)
      yield* Effect.forEach([ada, bob], insertUser)
      yield* chats.insert(stored)

      const owned = yield* chats.selectOne({ id: stored.id, userId: ada })
      const foreign = yield* chats.selectOne({ id: stored.id, userId: bob })

      assertSchemaEquals(SelectedChat, owned, Option.some(stored))
      assert.deepStrictEqual(foreign, Option.none())
    }).pipe(Effect.provide(RepositoryStackPgTest)),
  )

  it.effect("selectMany selects the user's chats, the newest created first", () =>
    Effect.gen(function* () {
      const chats = yield* ChatRepository
      const ada = UserId.make('0192d4e0-7b3a-7c00-8000-000000000010')
      const bob = UserId.make('0192d4e0-7b3a-7c00-8000-000000000011')
      const renamed = new Chat({
        ...chat('0192d4e0-7b3a-7c00-8000-000000000031', ada),
        updatedAt: at(3),
      })
      const newer = new Chat({
        ...chat('0192d4e0-7b3a-7c00-8000-000000000030', ada),
        createdAt: at(1),
        updatedAt: at(1),
      })
      yield* Effect.forEach([ada, bob], insertUser)
      yield* Effect.forEach(
        [renamed, newer, chat('0192d4e0-7b3a-7c00-8000-000000000032', bob)],
        chats.insert,
      )

      assertSchemaEquals(Schema.Array(Chat), yield* chats.selectMany({ userId: ada }), [
        newer,
        renamed,
      ])
    }).pipe(Effect.provide(RepositoryStackPgTest)),
  )

  it.effect('update where the status still holds moves it once; the second write dies', () =>
    Effect.gen(function* () {
      const chats = yield* ChatRepository
      const ada = UserId.make('0192d4e0-7b3a-7c00-8000-000000000010')
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
        Option.some(new Chat({ ...idle, status: 'queued' })),
      )
    }).pipe(Effect.provide(RepositoryStackPgTest)),
  )

  it.effect("delete removes the chat with its messages and keeps the user's other chats", () =>
    Effect.gen(function* () {
      const chats = yield* ChatRepository
      const messages = yield* MessageRepository
      const cy = UserId.make('0192d4e0-7b3a-7c00-8000-000000000012')
      const kept = chat('0192d4e0-7b3a-7c00-8000-000000000033', cy)
      const deleted = chat('0192d4e0-7b3a-7c00-8000-000000000034', cy)
      const keptQuestion = question('0192d4e0-7b3a-7c00-8000-000000000050', kept.id)
      const deletedReply = buildAssistantMessage({
        id: MessageId.make('0192d4e0-7b3a-7c00-8000-000000000051'),
        chatId: deleted.id,
        createdAt,
      })
      yield* insertUser(cy)
      yield* Effect.forEach([kept, deleted], chats.insert)
      yield* Effect.forEach([keptQuestion, deletedReply], messages.insert)

      yield* chats.delete({ id: deleted.id, userId: cy })

      assert.deepStrictEqual(yield* chats.selectOne({ id: deleted.id }), Option.none())
      assert.deepStrictEqual(yield* messages.selectOne({ id: deletedReply.id }), Option.none())
      assertSchemaEquals(SelectedChat, yield* chats.selectOne({ id: kept.id }), Option.some(kept))
      assertSchemaEquals(Messages, yield* messages.selectMany({ chatId: kept.id }), [keptQuestion])
    }).pipe(Effect.provide(RepositoryStackPgTest)),
  )

  it.effect("delete of an unknown chat or of another user's dies and removes nothing", () =>
    Effect.gen(function* () {
      const chats = yield* ChatRepository
      const dan = UserId.make('0192d4e0-7b3a-7c00-8000-000000000015')
      const stranger = UserId.make('0192d4e0-7b3a-7c00-8000-000000000016')
      const stored = chat('0192d4e0-7b3a-7c00-8000-00000000003e', dan)
      yield* Effect.forEach([dan, stranger], insertUser)
      yield* chats.insert(stored)

      const unknown = yield* chats
        .delete({ id: ChatId.make('0192d4e0-7b3a-7c00-8000-00000000003d') })
        .pipe(Effect.exit)
      const foreign = yield* chats.delete({ id: stored.id, userId: stranger }).pipe(Effect.exit)

      assert.isTrue(Exit.hasDies(unknown) && Exit.hasDies(foreign))
      assertSchemaEquals(
        SelectedChat,
        yield* chats.selectOne({ id: stored.id }),
        Option.some(stored),
      )
    }).pipe(Effect.provide(RepositoryStackPgTest)),
  )

  it.effect("delete takes the messages' attachments with them by the cascade", () =>
    Effect.gen(function* () {
      const chats = yield* ChatRepository
      const messages = yield* MessageRepository
      const attachments = yield* AttachmentRepository
      const eve = UserId.make('0192d4e0-7b3a-7c00-8000-000000000014')
      const stored = chat('0192d4e0-7b3a-7c00-8000-000000000037', eve)
      const withPhoto = question('0192d4e0-7b3a-7c00-8000-000000000052', stored.id)
      const attached = photo('0192d4e0-7b3a-7c00-8000-000000000020', {
        userId: eve,
        message: withPhoto,
        seconds: 0,
      })
      yield* insertUser(eve)
      yield* chats.insert(stored)
      yield* messages.insert(withPhoto)
      yield* attachments.insert(attached)

      yield* chats.delete({ id: stored.id })

      assert.deepStrictEqual(yield* messages.selectMany({ chatId: stored.id }), [])
      assert.deepStrictEqual(yield* attachments.selectMany({ id: [attached.id] }), [])
    }).pipe(Effect.provide(RepositoryStackPgTest)),
  )

  it.effect('update writes only the fields it sets, keeping a title written since the read', () =>
    Effect.gen(function* () {
      const chats = yield* ChatRepository
      const fay = UserId.make('0192d4e0-7b3a-7c00-8000-000000000015')
      const stored = chat('0192d4e0-7b3a-7c00-8000-000000000038', fay)
      const title = Option.some(ChatTitle.make('Trip'))
      const touchedAt = DateTime.makeUnsafe('2026-10-18T00:00:05.789Z')
      yield* insertUser(fay)
      yield* chats.insert(stored)
      yield* chats.update({ title }, { id: stored.id })

      yield* chats.update({ updatedAt: touchedAt }, { id: stored.id })

      assertSchemaEquals(
        SelectedChat,
        yield* chats.selectOne({ id: stored.id }),
        Option.some(new Chat({ ...stored, title, updatedAt: touchedAt })),
      )
    }).pipe(Effect.provide(RepositoryStackPgTest)),
  )

  it.effect('update where the chat is untitled dies on a titled one, writing nothing', () =>
    Effect.gen(function* () {
      const chats = yield* ChatRepository
      const gus = UserId.make('0192d4e0-7b3a-7c00-8000-000000000016')
      const titled = new Chat({
        ...chat('0192d4e0-7b3a-7c00-8000-000000000039', gus),
        title: Option.some(ChatTitle.make('Trip')),
      })
      yield* insertUser(gus)
      yield* chats.insert(titled)

      const exit = yield* chats
        .update(
          { title: Option.some(ChatTitle.make('Lisbon')) },
          { id: titled.id, title: Option.none() },
        )
        .pipe(Effect.exit)

      assert.isTrue(Exit.hasDies(exit))
      assertSchemaEquals(
        SelectedChat,
        yield* chats.selectOne({ id: titled.id }),
        Option.some(titled),
      )
    }).pipe(Effect.provide(RepositoryStackPgTest)),
  )

  it.effect('update given a whole chat writes only the fields a set may change', () =>
    Effect.gen(function* () {
      const chats = yield* ChatRepository
      const hal = UserId.make('0192d4e0-7b3a-7c00-8000-000000000017')
      const stored = chat('0192d4e0-7b3a-7c00-8000-00000000003a', hal)
      const later = DateTime.makeUnsafe('2026-10-18T00:00:09.000Z')
      const title = Option.some(ChatTitle.make('Trip'))
      yield* insertUser(hal)
      yield* chats.insert(stored)

      yield* chats.update(new Chat({ ...stored, title, createdAt: later, updatedAt: later }), {
        id: stored.id,
      })

      assertSchemaEquals(
        SelectedChat,
        yield* chats.selectOne({ id: stored.id }),
        Option.some(new Chat({ ...stored, title, updatedAt: later })),
      )
    }).pipe(Effect.provide(RepositoryStackPgTest)),
  )

  it.effect('update renames an existing chat and dies rather than create one', () =>
    Effect.gen(function* () {
      const chats = yield* ChatRepository
      const dee = UserId.make('0192d4e0-7b3a-7c00-8000-000000000013')
      const existing = chat('0192d4e0-7b3a-7c00-8000-000000000035', dee)
      const unknown = chat('0192d4e0-7b3a-7c00-8000-000000000036', dee)
      const title = Option.some(ChatTitle.make('Trip'))
      yield* insertUser(dee)
      yield* chats.insert(existing)

      yield* chats.update({ title }, { id: existing.id })
      const exit = yield* chats.update({ title }, { id: unknown.id }).pipe(Effect.exit)

      assert.isTrue(Exit.hasDies(exit))
      assertSchemaEquals(
        SelectedChat,
        yield* chats.selectOne({ id: existing.id }),
        Option.some(new Chat({ ...existing, title })),
      )
      assert.deepStrictEqual(yield* chats.selectOne({ id: unknown.id }), Option.none())
    }).pipe(Effect.provide(RepositoryStackPgTest)),
  )
})
