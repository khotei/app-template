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
  completeMessage,
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

const at = (seconds: number) => DateTime.add(createdAt, { seconds })

const question = (id: string, chatId: ChatId) =>
  buildUserMessage({ id: MessageId.make(id), chatId, text: 'Hi', createdAt })

const reply = (id: string, chatId: ChatId) =>
  buildAssistantMessage({ id: MessageId.make(id), chatId, createdAt: at(1) })

const photo = (
  id: string,
  { userId, messageId, seconds }: { userId: UserId; messageId: MessageId; seconds: number },
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
    messageId: Option.some(messageId),
  })

const SelectedChat = Schema.Option(Chat)

const Summary = Schema.Struct({ chat: Chat, activeMessage: Schema.Option(Message) })

const MessageDetails = Schema.Array(
  Schema.Struct({ message: Message, attachments: Schema.Array(Attachment) }),
)

const SelectedDetail = Schema.Option(Schema.Struct({ ...Summary.fields, messages: MessageDetails }))

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

  it.effect(
    "selects the user's chats most recently updated first, each with its active message",
    () =>
      Effect.gen(function* () {
        const chats = yield* ChatRepository
        const messages = yield* MessageRepository
        const ada = UserId.make('0192d4e0-7b3a-7c00-8000-000000000010')
        const bob = UserId.make('0192d4e0-7b3a-7c00-8000-000000000011')
        const older = new Chat({
          ...chat('0192d4e0-7b3a-7c00-8000-000000000031', ada),
          updatedAt: at(1),
        })
        const newer = new Chat({
          ...chat('0192d4e0-7b3a-7c00-8000-000000000030', ada),
          updatedAt: at(2),
        })
        const queued = reply('0192d4e0-7b3a-7c00-8000-000000000050', older.id)
        const completed = yield* completeMessage(
          reply('0192d4e0-7b3a-7c00-8000-000000000051', newer.id),
          { text: 'Hello', at: at(2) },
        )
        yield* Effect.forEach([ada, bob], insertUser)
        yield* Effect.forEach(
          [older, newer, chat('0192d4e0-7b3a-7c00-8000-000000000032', bob)],
          chats.insert,
        )
        yield* Effect.forEach(
          [question('0192d4e0-7b3a-7c00-8000-000000000052', older.id), queued, completed],
          messages.insert,
        )

        assertSchemaEquals(Schema.Array(Summary), yield* chats.selectSummaries(ada), [
          { chat: newer, activeMessage: Option.none() },
          { chat: older, activeMessage: Option.some(queued) },
        ])
      }).pipe(Effect.provide(RepositoryStackPgTest)),
  )

  it.effect(
    'selects a chat with its messages in creation order, each with its attachments in upload order',
    () =>
      Effect.gen(function* () {
        const chats = yield* ChatRepository
        const messages = yield* MessageRepository
        const attachments = yield* AttachmentRepository
        const ivy = UserId.make('0192d4e0-7b3a-7c00-8000-000000000018')
        const stored = chat('0192d4e0-7b3a-7c00-8000-00000000003b', ivy)
        const asked = question('0192d4e0-7b3a-7c00-8000-000000000055', stored.id)
        const queued = reply('0192d4e0-7b3a-7c00-8000-000000000053', stored.id)
        const firstUploaded = photo('0192d4e0-7b3a-7c00-8000-000000000023', {
          userId: ivy,
          messageId: asked.id,
          seconds: 0,
        })
        const secondUploaded = photo('0192d4e0-7b3a-7c00-8000-000000000021', {
          userId: ivy,
          messageId: asked.id,
          seconds: 1,
        })
        yield* insertUser(ivy)
        yield* chats.insert(stored)
        yield* Effect.forEach([queued, asked], messages.insert)
        yield* Effect.forEach([secondUploaded, firstUploaded], attachments.insert)

        assertSchemaEquals(
          SelectedDetail,
          yield* chats.selectDetail(stored.id),
          Option.some({
            chat: stored,
            activeMessage: Option.some(queued),
            messages: [
              { message: asked, attachments: [firstUploaded, secondUploaded] },
              { message: queued, attachments: [] },
            ],
          }),
        )
        assert.deepStrictEqual(
          yield* chats.selectDetail(ChatId.make('0192d4e0-7b3a-7c00-8000-00000000003c')),
          Option.none(),
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

      yield* chats.delete(deleted.id)

      assert.deepStrictEqual(yield* chats.selectById(deleted.id), Option.none())
      assert.deepStrictEqual(yield* messages.selectById(deletedReply.id), Option.none())
      assertSchemaEquals(SelectedChat, yield* chats.selectById(kept.id), Option.some(kept))
      assertSchemaEquals(MessageDetails, yield* messages.selectByChat(kept.id), [
        { message: keptQuestion, attachments: [] },
      ])
    }).pipe(Effect.provide(RepositoryStackPgTest)),
  )

  it.effect('delete dies and removes nothing while a message of the chat has an attachment', () =>
    Effect.gen(function* () {
      const chats = yield* ChatRepository
      const messages = yield* MessageRepository
      const attachments = yield* AttachmentRepository
      const eve = UserId.make('0192d4e0-7b3a-7c00-8000-000000000014')
      const stored = chat('0192d4e0-7b3a-7c00-8000-000000000037', eve)
      const withPhoto = question('0192d4e0-7b3a-7c00-8000-000000000052', stored.id)
      const attached = photo('0192d4e0-7b3a-7c00-8000-000000000020', {
        userId: eve,
        messageId: withPhoto.id,
        seconds: 0,
      })
      yield* insertUser(eve)
      yield* chats.insert(stored)
      yield* messages.insert(withPhoto)
      yield* attachments.insert(attached)

      const exit = yield* Effect.exit(chats.delete(stored.id))

      assert.isTrue(Exit.hasDies(exit))
      assertSchemaEquals(SelectedChat, yield* chats.selectById(stored.id), Option.some(stored))
      assertSchemaEquals(MessageDetails, yield* messages.selectByChat(stored.id), [
        { message: withPhoto, attachments: [attached] },
      ])
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
        yield* chats.selectById(stored.id),
        Option.some(new Chat({ ...stored, title, updatedAt: later })),
      )
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
      assertSchemaEquals(
        SelectedChat,
        yield* chats.selectById(existing.id),
        Option.some(new Chat({ ...existing, title })),
      )
      assert.deepStrictEqual(yield* chats.selectById(unknown.id), Option.none())
    }).pipe(Effect.provide(RepositoryStackPgTest)),
  )
})
