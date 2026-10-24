import { assert, describe, it } from '@effect/vitest'
import { Array as Arr, DateTime, Effect, Layer, Option, Schema } from 'effect'
import { KeyValueStore } from 'effect/persistence'

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
  buildChat,
  buildUserMessage,
  ChatId,
  ChatRepository,
  MessageId,
  MessageRepository,
} from '@app-template/domain/chat'
import {
  buildUser,
  Credential,
  SecretHash,
  UserId,
  UserRepository,
} from '@app-template/domain/user'
import { assertSchemaEquals } from '@app-template/testing'

import {
  AttachmentRepositoryKv,
  AttachmentRepositoryPg,
} from '#infrastructure/attachment/attachment.repository'
import { ChatRepositoryKv, ChatRepositoryPg } from '#infrastructure/chat/chat.repository'
import { MessageRepositoryKv, MessageRepositoryPg } from '#infrastructure/chat/message.repository'
import { DbTest } from '#infrastructure/db/testing/db'
import { UserRepositoryKv, UserRepositoryPg } from '#infrastructure/user/user.repository'

const createdAt = DateTime.makeUnsafe('2026-10-18T00:00:00.123Z')

const userId = UserId.make('0192d4e0-7b3a-7c00-8000-000000000010')

const chatId = ChatId.make('0192d4e0-7b3a-7c00-8000-000000000040')

const messageId = MessageId.make('0192d4e0-7b3a-7c00-8000-000000000050')

const attachment = (id: string) =>
  buildAttachment({
    id: AttachmentId.make(id),
    userId,
    fileName: FileName.make('photo.png'),
    mediaType: MediaType.make('image/png'),
    size: FileSize.make(1024),
    createdAt,
  })

const unknownId = AttachmentId.make('0192d4e0-7b3a-7c00-8000-000000000029')

const SelectedAttachment = Schema.Option(Attachment)

const Attachments = Schema.Array(Attachment)

/** Writes the user, and the chat and message a bound attachment's foreign key needs. */
const insertMessage = Effect.gen(function* () {
  const users = yield* UserRepository
  const chats = yield* ChatRepository
  const messages = yield* MessageRepository

  yield* users.insert(
    buildUser({ id: userId, createdAt }),
    new Credential({ kind: 'secret', hash: SecretHash.make('a'.repeat(64)) }),
  )
  yield* chats.insert(buildChat({ id: chatId, userId, createdAt }))
  yield* messages.insert(
    buildUserMessage({ id: messageId, chatId, text: 'Hi', attachmentIds: [], createdAt }),
  )
})

const AttachmentRepositoryKvMemory = Layer.mergeAll(
  AttachmentRepositoryKv,
  MessageRepositoryKv,
  ChatRepositoryKv,
  UserRepositoryKv,
).pipe(Layer.provide(KeyValueStore.layerMemory))

const AttachmentRepositoryPgTest = Layer.mergeAll(
  AttachmentRepositoryPg,
  MessageRepositoryPg,
  ChatRepositoryPg,
  UserRepositoryPg,
).pipe(Layer.provide(DbTest))

describe.each([
  { name: 'the key-value store', repository: AttachmentRepositoryKvMemory },
  { name: 'Postgres', repository: AttachmentRepositoryPgTest },
])('AttachmentRepository on $name', ({ repository }) => {
  it.effect('selects an attachment back, unbound and once bound', () =>
    Effect.gen(function* () {
      const attachments = yield* AttachmentRepository
      const unbound = attachment('0192d4e0-7b3a-7c00-8000-000000000021')
      const bound = new Attachment({ ...unbound, messageId: Option.some(messageId) })
      yield* insertMessage
      yield* attachments.insert(unbound)

      const beforeBind = yield* attachments.selectById(unbound.id)
      yield* attachments.update(bound)
      const afterBind = yield* attachments.selectById(unbound.id)

      assertSchemaEquals(SelectedAttachment, beforeBind, Option.some(unbound))
      assertSchemaEquals(SelectedAttachment, afterBind, Option.some(bound))
    }).pipe(Effect.provide(repository)),
  )

  it.effect('update never creates an attachment', () =>
    Effect.gen(function* () {
      const attachments = yield* AttachmentRepository
      yield* insertMessage

      yield* attachments.update(attachment(unknownId))

      assert.deepStrictEqual(yield* attachments.selectById(unknownId), Option.none())
    }).pipe(Effect.provide(repository)),
  )

  it.effect('selects the attachments found in the order asked, leaving out unknown ids', () =>
    Effect.gen(function* () {
      const attachments = yield* AttachmentRepository
      const first = attachment('0192d4e0-7b3a-7c00-8000-000000000021')
      const second = attachment('0192d4e0-7b3a-7c00-8000-000000000022')
      yield* insertMessage
      yield* Effect.forEach([first, second], attachments.insert)

      const selected = yield* attachments.selectByIds([second.id, unknownId, first.id])

      assertSchemaEquals(Attachments, selected, [second, first])
      assert.deepStrictEqual(yield* attachments.selectByIds([]), [])
    }).pipe(Effect.provide(repository)),
  )

  it.effect('deletes the attachments asked for and keeps the rest', () =>
    Effect.gen(function* () {
      const attachments = yield* AttachmentRepository
      const kept = attachment('0192d4e0-7b3a-7c00-8000-000000000023')
      const dropped = [
        attachment('0192d4e0-7b3a-7c00-8000-000000000024'),
        attachment('0192d4e0-7b3a-7c00-8000-000000000025'),
      ]
      yield* insertMessage
      yield* Effect.forEach(Arr.prepend(dropped, kept), attachments.insert)

      const droppedIds = Arr.map(dropped, (each) => each.id)
      yield* attachments.deleteByIds(Arr.append(droppedIds, unknownId))
      yield* attachments.deleteByIds([])

      const ids = Arr.prepend(droppedIds, kept.id)
      assertSchemaEquals(Attachments, yield* attachments.selectByIds(ids), [kept])
    }).pipe(Effect.provide(repository)),
  )
})
