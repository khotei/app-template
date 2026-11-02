import { assert, describe, it } from '@effect/vitest'
import { Effect, Exit, Layer, Option, Schema } from 'effect'

import { assertSchemaEquals } from '@app-template/testing'

import type { AttachmentEntity } from '#kernel/data/attachment/attachment.entity'
import { attachments } from '#kernel/data/attachment/attachment.table'
import { ChatRepository } from '#kernel/data/chat/chat.repository'
import { MessageEntity } from '#kernel/data/chat/message.entity'
import { MessageRepository } from '#kernel/data/chat/message.repository'
import { Db } from '#kernel/data/db.client'
import { users } from '#kernel/data/user/user.table'
import { DbTest } from '#testing-e2e/data/db.test-layer'

type AttachmentRow = typeof AttachmentEntity.Type

const RepositoriesTest = Layer.mergeAll(ChatRepository.layer, MessageRepository.layer).pipe(
  Layer.provideMerge(DbTest),
)

const createdAt = new Date('2026-10-18T00:00:00.123Z')

const at = (seconds: number) => new Date(createdAt.getTime() + seconds * 1000)

const userId = '0192d4e0-7b3a-7c00-8000-000000000010'

const userMessage = (id: string, { chatId, seconds = 0 }: { chatId: string; seconds?: number }) =>
  ({
    id,
    chatId,
    author: 'user',
    status: 'done',
    text: 'Hi',
    error: null,
    createdAt: at(seconds),
    updatedAt: at(seconds),
    attachments: [],
  }) satisfies MessageEntity

const assistantMessage = (
  id: string,
  { chatId, seconds = 0 }: { chatId: string; seconds?: number },
): MessageEntity => ({
  ...userMessage(id, { chatId, seconds }),
  author: 'assistant',
  status: 'queued',
  text: '',
})

const completed = (message: MessageEntity, seconds: number): MessageEntity => ({
  ...message,
  status: 'done',
  text: 'Hello',
  updatedAt: at(seconds),
})

const attachment = (
  id: string,
  { message, seconds }: { message: MessageEntity; seconds: number },
): AttachmentRow => ({
  id,
  userId,
  messageId: message.id,
  chatId: message.chatId,
  fileName: 'photo.png',
  mediaType: 'image/png',
  size: 1024,
  createdAt: at(seconds),
})

const Messages = Schema.Array(MessageEntity)

const SelectedMessage = Schema.Option(MessageEntity)

const insertOwnedChats = (chatIds: ReadonlyArray<string>) =>
  Effect.gen(function* () {
    const db = yield* Db
    const chats = yield* ChatRepository

    yield* db.insert(users).values({ id: userId, createdAt: new Date(0) })
    yield* Effect.forEach(
      chatIds,
      (id) =>
        chats.insert({
          id,
          userId,
          title: null,
          status: 'idle',
          createdAt: new Date(0),
          updatedAt: new Date(0),
        }),
      { discard: true },
    )
  })

describe('MessageRepository', () => {
  it.effect("selects the chat's messages in creation order, not id order", () =>
    Effect.gen(function* () {
      const messages = yield* MessageRepository
      const chatId = '0192d4e0-7b3a-7c00-8000-000000000040'
      const other = '0192d4e0-7b3a-7c00-8000-000000000041'
      const question = userMessage('0192d4e0-7b3a-7c00-8000-000000000052', { chatId })
      const reply = assistantMessage('0192d4e0-7b3a-7c00-8000-000000000051', { chatId, seconds: 1 })
      yield* insertOwnedChats([chatId, other])
      yield* Effect.forEach(
        [question, userMessage('0192d4e0-7b3a-7c00-8000-000000000050', { chatId: other }), reply],
        (each) => messages.insert(each),
      )

      assertSchemaEquals(Messages, yield* messages.selectMany({ chatId }), [question, reply])
    }).pipe(Effect.provide(RepositoriesTest)),
  )

  it.effect("selectOne reads another chat's message or a stranger's chat's as none", () =>
    Effect.gen(function* () {
      const messages = yield* MessageRepository
      const chatId = '0192d4e0-7b3a-7c00-8000-00000000004c'
      const other = '0192d4e0-7b3a-7c00-8000-00000000004d'
      const strangerId = '0192d4e0-7b3a-7c00-8000-000000000011'
      const question = userMessage('0192d4e0-7b3a-7c00-8000-00000000005e', { chatId })
      yield* insertOwnedChats([chatId, other])
      yield* messages.insert(question)

      const owned = yield* messages.selectOne({ id: question.id, chatId, userId })
      const elsewhere = yield* messages.selectOne({ id: question.id, chatId: other })
      const foreign = yield* messages.selectOne({ id: question.id, userId: strangerId })

      assertSchemaEquals(SelectedMessage, owned, Option.some(question))
      assert.deepStrictEqual([elsewhere, foreign], [Option.none(), Option.none()])
    }).pipe(Effect.provide(RepositoriesTest)),
  )

  it.effect("selectOne by chatId reads the chat's first message, none for an empty chat", () =>
    Effect.gen(function* () {
      const messages = yield* MessageRepository
      const chatId = '0192d4e0-7b3a-7c00-8000-00000000004a'
      const empty = '0192d4e0-7b3a-7c00-8000-00000000004b'
      const first = userMessage('0192d4e0-7b3a-7c00-8000-00000000005f', { chatId })
      yield* insertOwnedChats([chatId, empty])
      yield* messages.insert(
        userMessage('0192d4e0-7b3a-7c00-8000-00000000005d', { chatId, seconds: 1 }),
      )
      yield* messages.insert(first)

      assertSchemaEquals(SelectedMessage, yield* messages.selectOne({ chatId }), Option.some(first))
      assert.deepStrictEqual(yield* messages.selectOne({ chatId: empty }), Option.none())
    }).pipe(Effect.provide(RepositoriesTest)),
  )

  it.effect('selects a queued assistant message as active, and none once it completes', () =>
    Effect.gen(function* () {
      const messages = yield* MessageRepository
      const chatId = '0192d4e0-7b3a-7c00-8000-000000000042'
      const queued = assistantMessage('0192d4e0-7b3a-7c00-8000-000000000054', { chatId })
      const active = ['queued', 'preparing', 'generating'] as const
      yield* insertOwnedChats([chatId])
      yield* messages.insert(userMessage('0192d4e0-7b3a-7c00-8000-000000000053', { chatId }))
      yield* messages.insert(queued)

      assertSchemaEquals(Messages, yield* messages.selectMany({ chatId, status: active }), [queued])

      yield* messages.update(completed(queued, 1), { id: queued.id, status: ['queued'] })

      assert.deepStrictEqual(yield* messages.selectMany({ chatId, status: active }), [])
    }).pipe(Effect.provide(RepositoriesTest)),
  )

  it.effect('insert refuses a second active reply in a chat and keeps the first', () =>
    Effect.gen(function* () {
      const messages = yield* MessageRepository
      const chatId = '0192d4e0-7b3a-7c00-8000-000000000044'
      const queued = assistantMessage('0192d4e0-7b3a-7c00-8000-000000000056', { chatId })
      const second = assistantMessage('0192d4e0-7b3a-7c00-8000-000000000057', {
        chatId,
        seconds: 1,
      })
      yield* insertOwnedChats([chatId])

      yield* messages.insert(queued)
      const exit = yield* messages.insert(second).pipe(Effect.exit)

      assert.isTrue(Exit.hasDies(exit))
      assertSchemaEquals(Messages, yield* messages.selectMany({ chatId }), [queued])
    }).pipe(Effect.provide(RepositoriesTest)),
  )

  it.effect('insert accepts a completed reply beside an active one', () =>
    Effect.gen(function* () {
      const messages = yield* MessageRepository
      const chatId = '0192d4e0-7b3a-7c00-8000-000000000045'
      const queued = assistantMessage('0192d4e0-7b3a-7c00-8000-000000000058', { chatId })
      const done = completed(
        assistantMessage('0192d4e0-7b3a-7c00-8000-000000000059', { chatId, seconds: 1 }),
        2,
      )
      yield* insertOwnedChats([chatId])

      yield* Effect.forEach([queued, done], messages.insert)

      assertSchemaEquals(Messages, yield* messages.selectMany({ chatId }), [queued, done])
    }).pipe(Effect.provide(RepositoriesTest)),
  )

  it.effect('update from a status the message has left dies and changes nothing', () =>
    Effect.gen(function* () {
      const messages = yield* MessageRepository
      const chatId = '0192d4e0-7b3a-7c00-8000-000000000049'
      const generating: MessageEntity = {
        ...assistantMessage('0192d4e0-7b3a-7c00-8000-00000000005b', { chatId }),
        status: 'generating',
        updatedAt: at(2),
      }
      yield* insertOwnedChats([chatId])
      yield* messages.insert(generating)

      const exit = yield* messages
        .update(completed(generating, 3), { id: generating.id, status: ['preparing'] })
        .pipe(Effect.exit)

      assert.isTrue(Exit.hasDies(exit))
      assertSchemaEquals(
        SelectedMessage,
        yield* messages.selectOne({ id: generating.id }),
        Option.some(generating),
      )
    }).pipe(Effect.provide(RepositoriesTest)),
  )

  it.effect('update rewrites a message in place and never creates one', () =>
    Effect.gen(function* () {
      const messages = yield* MessageRepository
      const chatId = '0192d4e0-7b3a-7c00-8000-000000000046'
      const queued = assistantMessage('0192d4e0-7b3a-7c00-8000-000000000059', { chatId })
      const unknown = assistantMessage('0192d4e0-7b3a-7c00-8000-00000000005a', { chatId })
      const done = completed(queued, 1)
      yield* insertOwnedChats([chatId])
      yield* messages.insert(queued)

      yield* messages.update(done, { id: queued.id, status: ['queued'] })
      const exit = yield* messages
        .update(unknown, { id: unknown.id, status: ['queued'] })
        .pipe(Effect.exit)

      assert.isTrue(Exit.hasDies(exit))
      assertSchemaEquals(Messages, yield* messages.selectMany({ chatId }), [done])
      assert.deepStrictEqual(yield* messages.selectOne({ id: unknown.id }), Option.none())
    }).pipe(Effect.provide(RepositoriesTest)),
  )

  it.effect('update where the owner differs dies and changes nothing', () =>
    Effect.gen(function* () {
      const messages = yield* MessageRepository
      const chatId = '0192d4e0-7b3a-7c00-8000-00000000004e'
      const strangerId = '0192d4e0-7b3a-7c00-8000-000000000011'
      const queued = assistantMessage('0192d4e0-7b3a-7c00-8000-000000000063', { chatId })
      yield* insertOwnedChats([chatId])
      yield* messages.insert(queued)

      const exit = yield* messages
        .update(completed(queued, 1), { id: queued.id, userId: strangerId })
        .pipe(Effect.exit)

      assert.isTrue(Exit.hasDies(exit))
      assertSchemaEquals(
        SelectedMessage,
        yield* messages.selectOne({ id: queued.id }),
        Option.some(queued),
      )
    }).pipe(Effect.provide(RepositoriesTest)),
  )

  it.effect('selects the active message among the terminal ones, wherever it stands', () =>
    Effect.gen(function* () {
      const messages = yield* MessageRepository
      const chatId = '0192d4e0-7b3a-7c00-8000-000000000048'
      const generating: MessageEntity = {
        ...assistantMessage('0192d4e0-7b3a-7c00-8000-000000000060', { chatId }),
        status: 'generating',
        updatedAt: at(2),
      }
      const failed: MessageEntity = {
        ...assistantMessage('0192d4e0-7b3a-7c00-8000-000000000061', { chatId, seconds: 3 }),
        status: 'failed',
        error: {
          reason: 'ReplyFailed',
          message: 'The reply failed.',
          cause: 'provider timeout after 30s',
        },
        updatedAt: at(4),
      }
      const done = completed(
        assistantMessage('0192d4e0-7b3a-7c00-8000-000000000062', { chatId, seconds: 5 }),
        6,
      )
      yield* insertOwnedChats([chatId])
      yield* Effect.forEach([generating, failed, done], messages.insert)

      assertSchemaEquals(
        Messages,
        yield* messages.selectMany({ chatId, status: ['queued', 'preparing', 'generating'] }),
        [generating],
      )
      assertSchemaEquals(Messages, yield* messages.selectMany({ chatId }), [
        generating,
        failed,
        done,
      ])
    }).pipe(Effect.provide(RepositoriesTest)),
  )

  it.effect('reads a message back with its attachments in upload order, not the order sent', () =>
    Effect.gen(function* () {
      const db = yield* Db
      const messages = yield* MessageRepository
      const chatId = '0192d4e0-7b3a-7c00-8000-000000000047'
      const question = userMessage('0192d4e0-7b3a-7c00-8000-00000000005c', { chatId, seconds: 3 })
      const firstUploaded = attachment('0192d4e0-7b3a-7c00-8000-000000000023', {
        message: question,
        seconds: 0,
      })
      const secondUploaded = attachment('0192d4e0-7b3a-7c00-8000-000000000021', {
        message: question,
        seconds: 1,
      })
      const inUploadOrder: MessageEntity = {
        ...question,
        attachments: [firstUploaded, secondUploaded],
      }
      yield* insertOwnedChats([chatId])
      yield* messages.insert(question)
      yield* db.insert(attachments).values([secondUploaded, firstUploaded])

      assertSchemaEquals(
        SelectedMessage,
        yield* messages.selectOne({ id: question.id }),
        Option.some(inUploadOrder),
      )
      assertSchemaEquals(Messages, yield* messages.selectMany({ chatId }), [inUploadOrder])
    }).pipe(Effect.provide(RepositoriesTest)),
  )
})
