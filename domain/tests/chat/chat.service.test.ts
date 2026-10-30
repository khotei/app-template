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
import { ChatBusyError, ChatNotFoundError } from '#domain/chat/chat.error'
import { type ChatId, MessageId } from '#domain/chat/chat.id'
import { Chat, ChatTitle, ChatWithStatus } from '#domain/chat/chat.model'
import { ChatRepository } from '#domain/chat/chat.port'
import { ChatService } from '#domain/chat/chat.service'
import type { MessageInputInvalidError } from '#domain/chat/message.error'
import { buildUserMessage, completeMessage, type Message } from '#domain/chat/message.model'
import { MessageRepository } from '#domain/chat/message.port'
import { ask, chat, epoch, unknownChatId } from '#domain/testing/chat.test-fixture'
import { ChatTest, selectMessages, send } from '#domain/testing/chat.test-layer'
import { owner, stranger } from '#domain/testing/user.test-fixture'
import type { UserId } from '#domain/user/user.id'

const ChatBunTest = ChatTest.pipe(Layer.provideMerge(BunCrypto.layer))

const trip = ChatTitle.make('Trip')

const lisbonWeekend = ChatTitle.make('Lisbon weekend')

/** The `where` a generated title writes with: only a chat no one has titled yet. */
const untitled = (id: ChatId) => ({ id, title: Option.none<ChatTitle>() })

/** Completes an assistant message as the worker would, freeing its chat for the next send. */
const settle = (message: Message) =>
  Effect.gen(function* () {
    const messages = yield* MessageRepository
    const at = yield* DateTime.now

    const completed = yield* completeMessage(message, { text: 'Sure.', at })
    yield* messages.update(completed, { stage: message.stage })
    return completed
  })

const selectChat = (chatId: ChatId) =>
  ChatRepository.use((chats) => chats.selectOne({ id: chatId }))

type ChatCall = (
  service: ChatService['Service'],
  userId: UserId,
  chatId: ChatId,
) => Effect.Effect<unknown, ChatNotFoundError | ChatBusyError | MessageInputInvalidError>

const chatCalls: ReadonlyArray<{ readonly name: string; readonly call: ChatCall }> = [
  { name: 'getOne', call: (service, userId, chatId) => service.getOne({ id: chatId, userId }) },
  {
    name: 'rename',
    call: (service, userId, chatId) =>
      service.rename({ id: chatId, userId }, { title: Option.some(trip) }),
  },
  { name: 'delete', call: (service, userId, chatId) => service.delete(userId, chatId) },
  {
    name: 'findSendable',
    call: (service, userId, chatId) => service.findSendable(userId, chatId, ask('Lisbon?')),
  },
]

describe('ChatService', () => {
  it.effect('getOne says busy while a reply runs, and idle once it settles', () =>
    Effect.gen(function* () {
      const service = yield* ChatService
      const sent = yield* send(owner, chat.id, 'Lisbon?')

      const replying = yield* service.getOne({ id: chat.id, userId: owner })
      yield* settle(sent.assistantMessage)
      const settled = yield* service.getOne({ id: chat.id, userId: owner })

      assert.deepStrictEqual([replying.status, settled.status], ['busy', 'idle'])
    }).pipe(Effect.provide(ChatBunTest)),
  )

  it.effect('findSendable says the first send opens the chat, and no later one', () =>
    Effect.gen(function* () {
      const service = yield* ChatService
      const messages = yield* MessageRepository

      const opening = yield* service.findSendable(owner, chat.id, ask('Lisbon?'))
      yield* messages.insert(
        buildUserMessage({
          id: MessageId.make('0192d4e0-7b3a-7c00-8000-000000000031'),
          chatId: chat.id,
          text: 'Lisbon?',
          createdAt: opening.at,
        }),
      )
      const next = yield* service.findSendable(owner, chat.id, ask('And now?'))

      assert.deepStrictEqual([opening.opensChat, next.opensChat], [true, false])
    }).pipe(Effect.provide(ChatBunTest)),
  )

  it.effect('findSendable while a reply runs is ChatBusyError', () =>
    Effect.gen(function* () {
      const service = yield* ChatService
      yield* send(owner, chat.id, 'Lisbon?')

      const busy = yield* service.findSendable(owner, chat.id, ask('And now?')).pipe(Effect.flip)

      assertSchemaEquals(ChatBusyError, busy, new ChatBusyError({ id: chat.id }))
    }).pipe(Effect.provide(ChatBunTest)),
  )

  it.effect('rename writes the set it is given and returns the chat with it', () =>
    Effect.gen(function* () {
      const service = yield* ChatService
      const updatedAt = DateTime.add(epoch, { minutes: 1 })

      const renamed = yield* service.rename(
        { id: chat.id, userId: owner },
        { title: Option.some(trip), updatedAt },
      )

      assertEquals(renamed, new Chat({ ...chat, title: Option.some(trip), updatedAt }))
      assertEquals(yield* selectChat(chat.id), Option.some(renamed))
    }).pipe(Effect.provide(ChatBunTest)),
  )

  it.effect('rename where the title is none titles an untitled chat and keeps its updatedAt', () =>
    Effect.gen(function* () {
      const service = yield* ChatService

      yield* service.rename(untitled(chat.id), { title: Option.some(lisbonWeekend) })

      assertEquals(
        yield* selectChat(chat.id),
        Option.some(new Chat({ ...chat, title: Option.some(lisbonWeekend) })),
      )
    }).pipe(Effect.provide(ChatBunTest)),
  )

  it.effect(
    'rename where the title is none of a titled chat is ChatNotFoundError and keeps the title',
    () =>
      Effect.gen(function* () {
        const service = yield* ChatService
        const renamed = yield* service.rename({ id: chat.id }, { title: Option.some(trip) })

        const error = yield* service
          .rename(untitled(chat.id), { title: Option.some(lisbonWeekend) })
          .pipe(Effect.flip)

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

        yield* service.delete(owner, chat.id)

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
        assertEquals(
          yield* service.getOne({ id: chat.id, userId: owner }),
          new ChatWithStatus({ ...chat, status: 'idle' }),
        )
      }).pipe(Effect.provide(ChatBunTest)),
  )
})
