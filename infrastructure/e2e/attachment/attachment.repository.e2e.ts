import { assert, describe, it } from '@effect/vitest'
import { Array as Arr, DateTime, Effect, Exit, Option, pipe, Schema, Struct } from 'effect'

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

import {
  insertOwnedChats,
  RepositoryStackPgTest,
} from '#infrastructure/testing/repository-stack.test-layer'

const createdAt = DateTime.makeUnsafe('2026-10-18T00:00:00.123Z')

const userId = UserId.make('0192d4e0-7b3a-7c00-8000-000000000010')

const strangerId = UserId.make('0192d4e0-7b3a-7c00-8000-000000000011')

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
  yield* messages.insert(buildUserMessage({ id: messageId, chatId, text: 'Hi', createdAt }))
})

describe('AttachmentRepositoryPg', () => {
  it.effect('selects an attachment back, unbound and once bound', () =>
    Effect.gen(function* () {
      const attachments = yield* AttachmentRepository
      const unbound = attachment('0192d4e0-7b3a-7c00-8000-000000000021')
      const bound = new Attachment({ ...unbound, messageId: Option.some(messageId) })
      yield* insertMessage
      yield* attachments.insert(unbound)

      const beforeBind = yield* attachments.selectOne({ id: unbound.id })
      yield* attachments.update({ messageId: Option.some(messageId) }, { id: [unbound.id] })
      const afterBind = yield* attachments.selectOne({ id: unbound.id })

      assertSchemaEquals(SelectedAttachment, beforeBind, Option.some(unbound))
      assertSchemaEquals(SelectedAttachment, afterBind, Option.some(bound))
    }).pipe(Effect.provide(RepositoryStackPgTest)),
  )

  it.effect(
    "selectOne with the owner's id finds the attachment; with a stranger's it is none",
    () =>
      Effect.gen(function* () {
        const attachments = yield* AttachmentRepository
        const stored = attachment('0192d4e0-7b3a-7c00-8000-000000000021')
        yield* insertMessage
        yield* attachments.insert(stored)

        const owned = yield* attachments.selectOne({ id: stored.id, userId })
        const foreign = yield* attachments.selectOne({ id: stored.id, userId: strangerId })

        assertSchemaEquals(SelectedAttachment, owned, Option.some(stored))
        assert.deepStrictEqual(foreign, Option.none())
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
      yield* messages.insert(buildUserMessage({ id: nextMessageId, chatId, text: 'Hi', createdAt }))
      yield* pipe(free, Arr.append(boundBefore), Effect.forEach(attachments.insert))

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
        yield* attachments.selectMany({
          id: pipe(free, Arr.append(boundBefore), Arr.map(Struct.get('id'))),
        }),
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

      const selected = yield* attachments.selectMany({ id: [second.id, unknownId, first.id] })
      const foreign = yield* attachments.selectMany({ id: [first.id], userId: strangerId })

      assertSchemaEquals(Attachments, selected, [second, first])
      assert.deepStrictEqual(foreign, [])
      assert.deepStrictEqual(yield* attachments.selectMany({ id: [] }), [])
    }).pipe(Effect.provide(RepositoryStackPgTest)),
  )

  it.effect("selects by owner all of the owner's attachments and none of a stranger's", () =>
    Effect.gen(function* () {
      const attachments = yield* AttachmentRepository
      const owned = [
        attachment('0192d4e0-7b3a-7c00-8000-000000000021'),
        attachment('0192d4e0-7b3a-7c00-8000-000000000022'),
      ]
      const foreign = new Attachment({
        ...attachment('0192d4e0-7b3a-7c00-8000-000000000026'),
        userId: strangerId,
      })
      yield* insertMessage
      yield* insertOwnedChats(strangerId, [])
      yield* pipe(owned, Arr.append(foreign), Effect.forEach(attachments.insert))

      const ownersRows = yield* attachments.selectMany({ userId })
      const strangersRows = yield* attachments.selectMany({ userId: strangerId })

      assertSchemaEquals(Attachments, sortById(ownersRows), sortById(owned))
      assertSchemaEquals(Attachments, strangersRows, [foreign])
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
      yield* pipe(dropped, Arr.prepend(kept), Effect.forEach(attachments.insert))

      const droppedIds = Arr.map(dropped, (each) => each.id)
      yield* attachments.delete({ id: Arr.append(droppedIds, unknownId) })

      const ids = Arr.prepend(droppedIds, kept.id)
      assertSchemaEquals(Attachments, yield* attachments.selectMany({ id: ids }), [kept])
    }).pipe(Effect.provide(RepositoryStackPgTest)),
  )

  it.effect('delete where no row holds dies', () =>
    Effect.gen(function* () {
      const attachments = yield* AttachmentRepository

      const exit = yield* attachments.delete({ id: [unknownId] }).pipe(Effect.exit)

      assert.isTrue(Exit.hasDies(exit))
    }).pipe(Effect.provide(RepositoryStackPgTest)),
  )
})
