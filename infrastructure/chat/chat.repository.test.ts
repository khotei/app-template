import { assert, describe, it } from '@effect/vitest'
import { Array as Arr, DateTime, Effect, Exit, Option, Order, Schema } from 'effect'

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

import { RepositoryStackPgTest } from '#infrastructure/testing/repository-stacks'
import { insertUser } from '#infrastructure/testing/rows'

const createdAt = DateTime.makeUnsafe('2026-10-18T00:00:00.123Z')

const chat = (id: string, userId: UserId) => buildChat({ id: ChatId.make(id), userId, createdAt })

const question = (id: string, chatId: ChatId) =>
  buildUserMessage({ id: MessageId.make(id), chatId, text: 'Hi', attachmentIds: [], createdAt })

const byId = Order.mapInput(Order.String, (chat: Chat) => chat.id)

const SelectedChat = Schema.Option(Chat)

const Chats = Schema.Array(Chat)

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
      yield* Effect.forEach([ada, bob], insertUser)
      yield* Effect.forEach(
        Arr.append(adas, chat('0192d4e0-7b3a-7c00-8000-000000000032', bob)),
        (each) => chats.insert(each),
      )

      const selected = yield* chats.selectByUser(ada)

      assertSchemaEquals(Chats, Arr.sort(selected, byId), Arr.sort(adas, byId))
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

      yield* chats.delete(deleted.id)

      assert.deepStrictEqual(yield* chats.selectById(deleted.id), Option.none())
      assert.deepStrictEqual(yield* messages.selectById(deletedReply.id), Option.none())
      assertSchemaEquals(Chats, yield* chats.selectByUser(cy), [kept])
      assertSchemaEquals(Messages, yield* messages.selectByChat(kept.id), [keptQuestion])
    }).pipe(Effect.provide(RepositoryStackPgTest)),
  )

  it.effect('delete dies and removes nothing while a message of the chat has an attachment', () =>
    Effect.gen(function* () {
      const chats = yield* ChatRepository
      const messages = yield* MessageRepository
      const attachments = yield* AttachmentRepository
      const eve = UserId.make('0192d4e0-7b3a-7c00-8000-000000000014')
      const stored = chat('0192d4e0-7b3a-7c00-8000-000000000037', eve)
      const photoId = AttachmentId.make('0192d4e0-7b3a-7c00-8000-000000000020')
      const withPhoto = new Message({
        ...question('0192d4e0-7b3a-7c00-8000-000000000052', stored.id),
        attachmentIds: [photoId],
      })
      const photo = new Attachment({
        ...buildAttachment({
          id: photoId,
          userId: eve,
          fileName: FileName.make('photo.png'),
          mediaType: MediaType.make('image/png'),
          size: FileSize.make(1024),
          createdAt,
        }),
        messageId: Option.some(withPhoto.id),
      })
      yield* insertUser(eve)
      yield* chats.insert(stored)
      yield* messages.insert(withPhoto)
      yield* attachments.insert(photo)

      const exit = yield* Effect.exit(chats.delete(stored.id))

      assert.isTrue(Exit.hasDies(exit))
      assertSchemaEquals(SelectedChat, yield* chats.selectById(stored.id), Option.some(stored))
      assertSchemaEquals(Messages, yield* messages.selectByChat(stored.id), [withPhoto])
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

      const touched = yield* chats.update({ updatedAt: touchedAt }, { id: stored.id })

      assert.isTrue(touched)
      assertSchemaEquals(
        SelectedChat,
        yield* chats.selectById(stored.id),
        Option.some(new Chat({ ...stored, title, updatedAt: touchedAt })),
      )
    }).pipe(Effect.provide(RepositoryStackPgTest)),
  )

  it.effect(
    'update where the chat is untitled answers false on a titled one, writing nothing',
    () =>
      Effect.gen(function* () {
        const chats = yield* ChatRepository
        const gus = UserId.make('0192d4e0-7b3a-7c00-8000-000000000016')
        const titled = new Chat({
          ...chat('0192d4e0-7b3a-7c00-8000-000000000039', gus),
          title: Option.some(ChatTitle.make('Trip')),
        })
        yield* insertUser(gus)
        yield* chats.insert(titled)

        const written = yield* chats.update(
          { title: Option.some(ChatTitle.make('Lisbon')) },
          { id: titled.id, title: Option.none() },
        )

        assert.isFalse(written)
        assertSchemaEquals(SelectedChat, yield* chats.selectById(titled.id), Option.some(titled))
      }).pipe(Effect.provide(RepositoryStackPgTest)),
  )

  it.effect('update renames an existing chat and never creates one', () =>
    Effect.gen(function* () {
      const chats = yield* ChatRepository
      const dee = UserId.make('0192d4e0-7b3a-7c00-8000-000000000013')
      const existing = chat('0192d4e0-7b3a-7c00-8000-000000000035', dee)
      const unknown = chat('0192d4e0-7b3a-7c00-8000-000000000036', dee)
      const title = Option.some(ChatTitle.make('Trip'))
      yield* insertUser(dee)
      yield* chats.insert(existing)

      const renamed = yield* chats.update({ title }, { id: existing.id })
      const created = yield* chats.update({ title }, { id: unknown.id })

      assert.isTrue(renamed)
      assert.isFalse(created)
      assertSchemaEquals(Chats, yield* chats.selectByUser(dee), [new Chat({ ...existing, title })])
    }).pipe(Effect.provide(RepositoryStackPgTest)),
  )
})
