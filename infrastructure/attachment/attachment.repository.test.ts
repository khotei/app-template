import { assert, describe, it } from '@effect/vitest'
import { Array as Arr, DateTime, Effect, Option, Schema } from 'effect'

import {
  Attachment,
  AttachmentId,
  AttachmentRepository,
  buildAttachment,
  FileName,
  FileSize,
  MediaType,
} from '@app-template/domain/attachment'
import { buildUserMessage, ChatId, MessageId, MessageRepository } from '@app-template/domain/chat'
import { UserId } from '@app-template/domain/user'
import { assertSchemaEquals, sortById } from '@app-template/testing'

import { insertOwnedChats, RepositoryStackPgTest } from '#infrastructure/testing/repository-stacks'

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

const insertMessage = Effect.gen(function* () {
  const messages = yield* MessageRepository

  yield* insertOwnedChats(userId, [chatId])
  yield* messages.insert(
    buildUserMessage({ id: messageId, chatId, text: 'Hi', attachmentIds: [], createdAt }),
  )
})

describe('AttachmentRepositoryPg', () => {
  it.effect('selects an attachment back, unbound and once bound', () =>
    Effect.gen(function* () {
      const attachments = yield* AttachmentRepository
      const unbound = attachment('0192d4e0-7b3a-7c00-8000-000000000021')
      const bound = new Attachment({ ...unbound, messageId: Option.some(messageId) })
      yield* insertMessage
      yield* attachments.insert(unbound)

      const beforeBind = yield* attachments.selectById(unbound.id)
      yield* attachments.update({ messageId: Option.some(messageId) }, { id: [unbound.id] })
      const afterBind = yield* attachments.selectById(unbound.id)

      assertSchemaEquals(SelectedAttachment, beforeBind, Option.some(unbound))
      assertSchemaEquals(SelectedAttachment, afterBind, Option.some(bound))
    }).pipe(Effect.provide(RepositoryStackPgTest)),
  )

  it.effect('update where unbound returns the ones it bound and leaves one bound before', () =>
    Effect.gen(function* () {
      const attachments = yield* AttachmentRepository
      const messages = yield* MessageRepository
      const nextMessageId = MessageId.make('0192d4e0-7b3a-7c00-8000-000000000051')
      const first = attachment('0192d4e0-7b3a-7c00-8000-000000000021')
      const second = attachment('0192d4e0-7b3a-7c00-8000-000000000022')
      const free = [first, second]
      const boundBefore = new Attachment({
        ...attachment('0192d4e0-7b3a-7c00-8000-000000000023'),
        messageId: Option.some(messageId),
      })
      yield* insertMessage
      yield* messages.insert(
        buildUserMessage({ id: nextMessageId, chatId, text: 'Hi', attachmentIds: [], createdAt }),
      )
      yield* Effect.forEach(Arr.append(free, boundBefore), attachments.insert)

      const bound = yield* attachments.update(
        { messageId: Option.some(nextMessageId) },
        { id: [first.id, boundBefore.id, unknownId, second.id], messageId: Option.none() },
      )

      const boundNow = Arr.map(
        free,
        (each) => new Attachment({ ...each, messageId: Option.some(nextMessageId) }),
      )
      assertSchemaEquals(Attachments, sortById(bound), boundNow)
      assertSchemaEquals(
        Attachments,
        yield* attachments.selectByIds(Arr.map(Arr.append(free, boundBefore), (each) => each.id)),
        Arr.append(boundNow, boundBefore),
      )
    }).pipe(Effect.provide(RepositoryStackPgTest)),
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
    }).pipe(Effect.provide(RepositoryStackPgTest)),
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
    }).pipe(Effect.provide(RepositoryStackPgTest)),
  )
})
