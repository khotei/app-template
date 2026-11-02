import { assert, describe, it } from '@effect/vitest'
import { Array as Arr, Effect, Exit, Layer, Option, pipe, Schema, Struct } from 'effect'

import { assertSchemaEquals } from '@app-template/packages/testing'

import { AttachmentEntity } from '#kernel/data/attachment/attachment.entity'
import { AttachmentRepository } from '#kernel/data/attachment/attachment.repository'
import { chats } from '#kernel/data/chat/chat.table'
import { messages } from '#kernel/data/chat/message.table'
import { Db } from '#kernel/data/db.client'
import { users } from '#kernel/data/user/user.table'
import { DbTest } from '#testing-e2e/data/db.test-layer'

const createdAt = new Date('2026-10-18T00:00:00.123Z')

const userId = '0192d4e0-7b3a-7c00-8000-000000000010'

const strangerId = '0192d4e0-7b3a-7c00-8000-000000000011'

const chatId = '0192d4e0-7b3a-7c00-8000-000000000040'

const messageId = '0192d4e0-7b3a-7c00-8000-000000000050'

const attachment = (id: string): AttachmentEntity => ({
  id,
  userId,
  messageId: null,
  chatId: null,
  fileName: 'photo.png',
  mediaType: 'image/png',
  size: 1024,
  createdAt,
})

const unknownId = '0192d4e0-7b3a-7c00-8000-000000000029'

const SelectedAttachment = Schema.Option(AttachmentEntity)

const Attachments = Schema.Array(AttachmentEntity)

const insertOwnedChat = (ownerId: string, id: string) =>
  Db.use((db) =>
    db
      .insert(users)
      .values({ id: ownerId, createdAt: new Date(0) })
      .pipe(
        Effect.andThen(
          db
            .insert(chats)
            .values({ id, userId: ownerId, title: null, createdAt, updatedAt: createdAt }),
        ),
      ),
  )

const insertMessage = (id: string) =>
  Db.use((db) =>
    db.insert(messages).values({
      id,
      chatId,
      author: 'user',
      status: 'done',
      text: 'Hi',
      error: null,
      createdAt,
      updatedAt: createdAt,
    }),
  )

const insertChatWithMessage = insertOwnedChat(userId, chatId).pipe(
  Effect.andThen(insertMessage(messageId)),
)

const AttachmentRepositoryDbTest = AttachmentRepository.layer.pipe(Layer.provideMerge(DbTest))

describe('AttachmentRepository', () => {
  it.effect('selects an attachment back, unbound and once bound', () =>
    Effect.gen(function* () {
      const attachments = yield* AttachmentRepository
      const unbound = attachment('0192d4e0-7b3a-7c00-8000-000000000021')
      const bound = { ...unbound, messageId, chatId }
      yield* insertChatWithMessage
      yield* attachments.insert(unbound)

      const beforeBind = yield* attachments.selectOne({ id: unbound.id })
      yield* attachments.update({ messageId, chatId }, { id: [unbound.id] })
      const afterBind = yield* attachments.selectOne({ id: unbound.id })

      assertSchemaEquals(SelectedAttachment, beforeBind, Option.some(unbound))
      assertSchemaEquals(SelectedAttachment, afterBind, Option.some(bound))
    }).pipe(Effect.provide(AttachmentRepositoryDbTest)),
  )

  it.effect(
    "selectOne with the owner's id finds the attachment; with a stranger's it is none",
    () =>
      Effect.gen(function* () {
        const attachments = yield* AttachmentRepository
        const stored = attachment('0192d4e0-7b3a-7c00-8000-000000000021')
        yield* insertChatWithMessage
        yield* attachments.insert(stored)

        const owned = yield* attachments.selectOne({ id: stored.id, userId })
        const foreign = yield* attachments.selectOne({ id: stored.id, userId: strangerId })

        assertSchemaEquals(SelectedAttachment, owned, Option.some(stored))
        assert.deepStrictEqual(foreign, Option.none())
      }).pipe(Effect.provide(AttachmentRepositoryDbTest)),
  )

  it.effect('update where unbound returns the ones it bound and leaves one bound before', () =>
    Effect.gen(function* () {
      const attachments = yield* AttachmentRepository
      const nextMessageId = '0192d4e0-7b3a-7c00-8000-000000000051'
      const first = attachment('0192d4e0-7b3a-7c00-8000-000000000021')
      const second = attachment('0192d4e0-7b3a-7c00-8000-000000000022')
      const free = [first, second]
      const boundBefore = {
        ...attachment('0192d4e0-7b3a-7c00-8000-000000000023'),
        messageId,
        chatId,
      }
      yield* insertChatWithMessage
      yield* insertMessage(nextMessageId)
      yield* pipe(free, Arr.append(boundBefore), Effect.forEach(attachments.insert))

      yield* attachments.update(
        { messageId: nextMessageId, chatId },
        { id: [first.id, boundBefore.id, unknownId, second.id], messageId: null },
      )

      const boundNow = Arr.map(free, (each) => ({ ...each, messageId: nextMessageId, chatId }))
      assertSchemaEquals(
        Attachments,
        yield* attachments.selectMany({
          id: pipe(free, Arr.append(boundBefore), Arr.map(Struct.get('id'))),
        }),
        Arr.append(boundNow, boundBefore),
      )
    }).pipe(Effect.provide(AttachmentRepositoryDbTest)),
  )

  it.effect('selects the attachments found in the order asked, leaving out unknown ids', () =>
    Effect.gen(function* () {
      const attachments = yield* AttachmentRepository
      const first = attachment('0192d4e0-7b3a-7c00-8000-000000000021')
      const second = attachment('0192d4e0-7b3a-7c00-8000-000000000022')
      yield* insertChatWithMessage
      yield* Effect.forEach([first, second], attachments.insert)

      const selected = yield* attachments.selectMany({ id: [second.id, unknownId, first.id] })
      const foreign = yield* attachments.selectMany({ id: [first.id], userId: strangerId })

      assertSchemaEquals(Attachments, selected, [second, first])
      assert.deepStrictEqual(foreign, [])
      assert.deepStrictEqual(yield* attachments.selectMany({ id: [] }), [])
    }).pipe(Effect.provide(AttachmentRepositoryDbTest)),
  )

  it.effect('deletes the attachments asked for and keeps the rest', () =>
    Effect.gen(function* () {
      const attachments = yield* AttachmentRepository
      const kept = attachment('0192d4e0-7b3a-7c00-8000-000000000023')
      const dropped = [
        attachment('0192d4e0-7b3a-7c00-8000-000000000024'),
        attachment('0192d4e0-7b3a-7c00-8000-000000000025'),
      ]
      yield* insertChatWithMessage
      yield* pipe(dropped, Arr.prepend(kept), Effect.forEach(attachments.insert))

      const droppedIds = Arr.map(dropped, (each) => each.id)
      yield* attachments.delete({ id: Arr.append(droppedIds, unknownId) })

      const ids = Arr.prepend(droppedIds, kept.id)
      assertSchemaEquals(Attachments, yield* attachments.selectMany({ id: ids }), [kept])
    }).pipe(Effect.provide(AttachmentRepositoryDbTest)),
  )

  it.effect("update dies and binds nothing when chatId is not the message's chat", () =>
    Effect.gen(function* () {
      const attachments = yield* AttachmentRepository
      const otherChatId = '0192d4e0-7b3a-7c00-8000-000000000041'
      const unbound = attachment('0192d4e0-7b3a-7c00-8000-000000000028')
      yield* insertChatWithMessage
      yield* insertOwnedChat(strangerId, otherChatId)
      yield* attachments.insert(unbound)

      const exit = yield* attachments
        .update({ messageId, chatId: otherChatId }, { id: [unbound.id] })
        .pipe(Effect.exit)

      assert.isTrue(Exit.hasDies(exit))
      assertSchemaEquals(Attachments, yield* attachments.selectMany({ id: [unbound.id] }), [
        unbound,
      ])
    }).pipe(Effect.provide(AttachmentRepositoryDbTest)),
  )

  it.effect.each([
    {
      name: 'update',
      write: (attachments: AttachmentRepository['Service']) =>
        attachments.update({ messageId, chatId }, { id: [unknownId] }),
    },
    {
      name: 'delete',
      write: (attachments: AttachmentRepository['Service']) =>
        attachments.delete({ id: [unknownId] }),
    },
  ])('$name where no row holds dies', ({ write }) =>
    Effect.gen(function* () {
      const attachments = yield* AttachmentRepository

      const exit = yield* write(attachments).pipe(Effect.exit)

      assert.isTrue(Exit.hasDies(exit))
    }).pipe(Effect.provide(AttachmentRepositoryDbTest)),
  )
})
