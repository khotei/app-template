import { assert, describe, it } from '@effect/vitest'
import { Effect, Layer, Option, Schema } from 'effect'

import { assertSchemaEquals } from '@app-template/packages/testing'

import type { AttachmentEntity } from '#kernel/data/attachment/attachment.entity'
import { attachments } from '#kernel/data/attachment/attachment.table'
import { ChatRepository } from '#kernel/data/chat/chat.repository'
import { MessageEntity } from '#kernel/data/chat/message.entity'
import { MessageRepository } from '#kernel/data/chat/message.repository'
import { Db } from '#kernel/data/db.client'
import { users } from '#kernel/data/user/user.table'
import { DbTest } from '#testing/data/e2e/db.test-layer'

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
    text: 'Hi',
    runId: null,
    createdAt: at(seconds),
    attachments: [],
  }) satisfies MessageEntity

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
      const followUp = userMessage('0192d4e0-7b3a-7c00-8000-000000000051', { chatId, seconds: 1 })
      yield* insertOwnedChats([chatId, other])
      yield* Effect.forEach(
        [
          question,
          userMessage('0192d4e0-7b3a-7c00-8000-000000000050', { chatId: other }),
          followUp,
        ],
        (each) => messages.insert(each),
      )

      assertSchemaEquals(Messages, yield* messages.selectMany({ chatId }), [question, followUp])
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
