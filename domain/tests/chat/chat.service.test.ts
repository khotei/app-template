import { BunCrypto } from '@effect/platform-bun'
import { assert, describe, it } from '@effect/vitest'
import { assertEquals } from '@effect/vitest/utils'
import { DateTime, Effect, Layer, Option, Stream } from 'effect'

import { assertSchemaEquals, png } from '@app-template/testing'

import { AttachmentId } from '#domain/attachment/attachment.id'
import {
  Attachment,
  buildAttachment,
  FileName,
  FileSize,
  MediaType,
} from '#domain/attachment/attachment.model'
import { AttachmentBucket, AttachmentRepository } from '#domain/attachment/attachment.port'
import { ChatNotFoundError } from '#domain/chat/chat.error'
import type { ChatId } from '#domain/chat/chat.id'
import { Chat, ChatTitle } from '#domain/chat/chat.model'
import { ChatRepository } from '#domain/chat/chat.port'
import { ChatService } from '#domain/chat/chat.service'
import { chat, epoch, unknownChatId } from '#domain/testing/chat.test-fixture'
import { ChatTest, selectMessages, send } from '#domain/testing/chat.test-layer'
import { owner, stranger } from '#domain/testing/user.test-fixture'
import type { UserId } from '#domain/user/user.id'

const ChatBunTest = ChatTest.pipe(Layer.provideMerge(BunCrypto.layer))

const trip = ChatTitle.make('Trip')

const lisbonWeekend = ChatTitle.make('Lisbon weekend')

/** The `where` a generated title writes with: only a chat no one has titled yet. */
const untitled = (id: ChatId) => ({ id, title: Option.none<ChatTitle>() })

const selectChat = (chatId: ChatId) =>
  ChatRepository.use((chats) => chats.selectOne({ id: chatId }))

type ChatCall = (
  service: ChatService['Service'],
  userId: UserId,
  chatId: ChatId,
) => Effect.Effect<unknown, ChatNotFoundError>

const chatCalls: ReadonlyArray<{ readonly name: string; readonly call: ChatCall }> = [
  { name: 'getOne', call: (service, userId, chatId) => service.getOne({ id: chatId, userId }) },
  {
    name: 'rename',
    call: (service, userId, chatId) => service.rename({ id: chatId, userId }, trip),
  },
  { name: 'delete', call: (service, userId, chatId) => service.delete({ id: chatId, userId }) },
]

describe('ChatService', () => {
  it.live("rename titles the owner's chat, moves its updatedAt and returns it", () =>
    Effect.gen(function* () {
      const service = yield* ChatService

      const renamed = yield* service.rename({ id: chat.id, userId: owner }, trip)

      assert.isTrue(DateTime.isGreaterThan(renamed.updatedAt, epoch))
      assertEquals(
        renamed,
        new Chat({ ...chat, title: Option.some(trip), updatedAt: renamed.updatedAt }),
      )
      assertEquals(yield* selectChat(chat.id), Option.some(renamed))
    }).pipe(Effect.provide(ChatBunTest)),
  )

  it.effect('rename where the title is none titles an untitled chat', () =>
    Effect.gen(function* () {
      const service = yield* ChatService

      const renamed = yield* service.rename(untitled(chat.id), lisbonWeekend)

      assertEquals(renamed.title, Option.some(lisbonWeekend))
      assertEquals(yield* selectChat(chat.id), Option.some(renamed))
    }).pipe(Effect.provide(ChatBunTest)),
  )

  it.effect(
    'rename where the title is none of a titled chat is ChatNotFoundError and keeps the title',
    () =>
      Effect.gen(function* () {
        const service = yield* ChatService
        const renamed = yield* service.rename({ id: chat.id, userId: owner }, trip)

        const error = yield* service.rename(untitled(chat.id), lisbonWeekend).pipe(Effect.flip)

        assertSchemaEquals(ChatNotFoundError, error, new ChatNotFoundError({ id: chat.id }))
        assertEquals(yield* selectChat(chat.id), Option.some(renamed))
      }).pipe(Effect.provide(ChatBunTest)),
  )

  it.effect(
    'delete while a reply runs removes the chat, its messages, their attachments and bytes',
    () =>
      Effect.gen(function* () {
        const service = yield* ChatService
        const attachments = yield* AttachmentRepository
        const bucket = yield* AttachmentBucket
        const { userMessage } = yield* send(owner, chat.id, 'Look')
        const photo = new Attachment({
          ...buildAttachment({
            id: AttachmentId.make('0192d4e0-7b3a-7c00-8000-000000000024'),
            userId: owner,
            fileName: FileName.make('photo.png'),
            mediaType: MediaType.make('image/png'),
            size: FileSize.make(png.length),
            createdAt: epoch,
          }),
          messageId: Option.some(userMessage.id),
          chatId: Option.some(chat.id),
        })
        yield* attachments.insert(photo)
        yield* bucket.insert(photo.id, Stream.make(png), photo)

        yield* service.delete({ id: chat.id, userId: owner })

        assertEquals(
          yield* ChatRepository.use((chats) => chats.selectOne({ id: chat.id })),
          Option.none(),
        )
        assertEquals(yield* selectMessages(chat.id), [])
        assertEquals(yield* attachments.selectMany({ id: [photo.id] }), [])
        assertEquals(yield* bucket.select(photo.id), Option.none())
      }).pipe(Effect.provide(ChatBunTest)),
  )

  it.effect.each(chatCalls)(
    "$name of another user's chat or of an unknown chat is ChatNotFoundError",
    ({ call }) =>
      Effect.gen(function* () {
        const service = yield* ChatService

        const foreign = yield* call(service, stranger, chat.id).pipe(Effect.flip)
        const missing = yield* call(service, owner, unknownChatId).pipe(Effect.flip)

        assertSchemaEquals(ChatNotFoundError, foreign, new ChatNotFoundError({ id: chat.id }))
        assertSchemaEquals(ChatNotFoundError, missing, new ChatNotFoundError({ id: unknownChatId }))
        assertEquals(yield* service.getOne({ id: chat.id, userId: owner }), chat)
      }).pipe(Effect.provide(ChatBunTest)),
  )
})
