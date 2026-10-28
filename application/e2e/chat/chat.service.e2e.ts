import { assert, describe, it } from '@effect/vitest'
import { assertEquals } from '@effect/vitest/utils'
import { Array as Arr, DateTime, Duration, Effect, Option, Record as Rec } from 'effect'

import {
  buildChat,
  Chat,
  ChatBusyError,
  ChatId,
  ChatNotFoundError,
  ChatRepository,
  ChatTitle,
  ChatTitledError,
  MessageNotFoundError,
} from '@app-template/domain/chat'
import {
  ask,
  chat,
  epoch,
  owner,
  stranger,
  unknownChatId,
  unknownMessageId,
  upload,
} from '@app-template/domain/testing'
import type { UserId } from '@app-template/domain/user'
import { assertSchemaEquals, isUuidV7 } from '@app-template/testing'

import { ChatService } from '#application/chat/chat.service'
import { SendMessageUseCase } from '#application/chat/send-message.use-case'
import { ChatTest, selectChat, selectMessages, settle } from '#application/testing/chat.test-layer'

type ChatCall = (
  service: ChatService['Service'],
  userId: UserId,
  chatId: ChatId,
) => Effect.Effect<unknown, ChatNotFoundError | MessageNotFoundError>

const chatCalls = [
  { name: 'get', call: (service, userId, chatId) => service.get(userId, chatId) },
  {
    name: 'rename',
    call: (service, userId, chatId) => service.rename(userId, chatId, ChatTitle.make('Trip')),
  },
  { name: 'delete', call: (service, userId, chatId) => service.delete(userId, chatId) },
  {
    name: 'getMessage',
    call: (service, userId, chatId) => service.getMessage(userId, chatId, unknownMessageId),
  },
] as const satisfies ReadonlyArray<{ readonly name: string; readonly call: ChatCall }>

describe('ChatService', () => {
  it.effect('create stores an untitled chat with a UUIDv7 id at the clock time', () =>
    Effect.gen(function* () {
      const service = yield* ChatService

      const created = yield* service.create(stranger)

      assert.isTrue(isUuidV7(created.id))
      assertEquals(created, buildChat({ id: created.id, userId: stranger, createdAt: epoch }))
      assertEquals(yield* service.list(stranger), [{ chat: created, activeMessage: Option.none() }])
    }).pipe(Effect.provide(ChatTest)),
  )

  it.live("list puts the last sent chat first with its active message, and only the user's", () =>
    Effect.gen(function* () {
      const service = yield* ChatService
      const sendMessage = yield* SendMessageUseCase
      const chats = yield* ChatRepository
      const later = buildChat({
        id: ChatId.make('0192d4e0-7b3a-7c00-8000-000000000021'),
        userId: owner,
        createdAt: DateTime.addDuration(epoch, Duration.millis(1)),
      })
      yield* chats.insert(later)
      yield* service.create(stranger)

      const { assistantMessage } = yield* sendMessage.send(owner, chat.id, ask('Lisbon?'))

      const summaries = yield* service.list(owner)
      assertEquals(
        Arr.map(summaries, (summary) => [summary.chat.id, summary.activeMessage]),
        [
          [chat.id, Option.some(assistantMessage.message)],
          [later.id, Option.none()],
        ],
      )
    }).pipe(Effect.provide(ChatTest)),
  )

  it.effect('get returns the messages with their attachments and the active message', () =>
    Effect.gen(function* () {
      const service = yield* ChatService
      const sendMessage = yield* SendMessageUseCase
      const photo = yield* upload(owner)
      const first = yield* sendMessage.send(owner, chat.id, {
        text: 'Look',
        attachmentIds: [photo.id],
      })
      yield* settle(first.assistantMessage.message)
      const second = yield* sendMessage.send(owner, chat.id, ask('And now?'))

      const detail = yield* service.get(owner, chat.id)

      assertEquals(
        Rec.fromEntries(
          Arr.map(detail.messages, ({ message, attachments }) => [message.id, attachments]),
        ),
        {
          [first.userMessage.message.id]: first.userMessage.attachments,
          [first.assistantMessage.message.id]: [],
          [second.userMessage.message.id]: [],
          [second.assistantMessage.message.id]: [],
        },
      )
      assertEquals(detail.activeMessage, Option.some(second.assistantMessage.message))
      assert.strictEqual(detail.chat.id, chat.id)
    }).pipe(Effect.provide(ChatTest)),
  )

  it.effect('getMessage returns the stored message with its attachments', () =>
    Effect.gen(function* () {
      const service = yield* ChatService
      const sendMessage = yield* SendMessageUseCase
      const photo = yield* upload(owner)
      const { userMessage } = yield* sendMessage.send(owner, chat.id, {
        text: 'Look',
        attachmentIds: [photo.id],
      })

      assertEquals(yield* service.getMessage(owner, chat.id, userMessage.message.id), userMessage)
    }).pipe(Effect.provide(ChatTest)),
  )

  it.effect('getMessage of an unknown id or of another chat is MessageNotFoundError', () =>
    Effect.gen(function* () {
      const service = yield* ChatService
      const sendMessage = yield* SendMessageUseCase
      const other = yield* service.create(owner)
      const { userMessage } = yield* sendMessage.send(owner, other.id, ask('Lisbon?'))

      const elsewhere = yield* Effect.flip(
        service.getMessage(owner, chat.id, userMessage.message.id),
      )
      const missing = yield* Effect.flip(service.getMessage(owner, chat.id, unknownMessageId))

      assertSchemaEquals(
        MessageNotFoundError,
        elsewhere,
        new MessageNotFoundError({ id: userMessage.message.id }),
      )
      assertSchemaEquals(
        MessageNotFoundError,
        missing,
        new MessageNotFoundError({ id: unknownMessageId }),
      )
    }).pipe(Effect.provide(ChatTest)),
  )

  it.effect('addAssistantMessage on a chat that has an active message is ChatBusyError', () =>
    Effect.gen(function* () {
      const service = yield* ChatService
      const sendable = yield* service.findSendable(owner, chat.id, ask('Lisbon?'))
      const first = yield* service.addAssistantMessage(sendable)

      const busy = yield* Effect.flip(service.addAssistantMessage(sendable))

      assertSchemaEquals(ChatBusyError, busy, new ChatBusyError({ id: chat.id }))
      assertEquals(yield* selectMessages(chat.id), [first])
    }).pipe(Effect.provide(ChatTest)),
  )

  it.live('rename sets the title and bumps updatedAt', () =>
    Effect.gen(function* () {
      const service = yield* ChatService

      const renamed = yield* service.rename(owner, chat.id, ChatTitle.make('Trip'))

      assert.isTrue(DateTime.isGreaterThan(renamed.updatedAt, epoch))
      assertEquals(
        renamed,
        new Chat({
          ...chat,
          title: Option.some(ChatTitle.make('Trip')),
          updatedAt: renamed.updatedAt,
        }),
      )
      assertEquals(yield* selectChat(chat.id), Option.some(renamed))
    }).pipe(Effect.provide(ChatTest)),
  )

  it.effect('addUserMessage on a chat deleted since findSendable is ChatNotFoundError', () =>
    Effect.gen(function* () {
      const service = yield* ChatService
      const sendable = yield* service.findSendable(owner, chat.id, ask('Lisbon?'))
      yield* service.delete(owner, chat.id)

      const error = yield* Effect.flip(service.addUserMessage(sendable))

      assertSchemaEquals(ChatNotFoundError, error, new ChatNotFoundError({ id: chat.id }))
      assertEquals(yield* selectMessages(chat.id), [])
    }).pipe(Effect.provide(ChatTest)),
  )

  it.effect('addUserMessage after a rename keeps the title the rename wrote', () =>
    Effect.gen(function* () {
      const service = yield* ChatService
      const title = ChatTitle.make('Lisbon weekend')
      const sendable = yield* service.findSendable(owner, chat.id, ask('Lisbon?'))
      yield* service.rename(owner, chat.id, title)

      yield* service.addUserMessage(sendable)

      const stored = yield* Effect.flatMap(selectChat(chat.id), Effect.fromOption)
      assertEquals(stored.title, Option.some(title))
    }).pipe(Effect.provide(ChatTest)),
  )

  it.effect('updateTitle titles an untitled chat and keeps its updatedAt', () =>
    Effect.gen(function* () {
      const service = yield* ChatService

      yield* service.updateTitle(chat.id, ChatTitle.make('Lisbon weekend'))

      assertEquals(
        yield* selectChat(chat.id),
        Option.some(new Chat({ ...chat, title: Option.some(ChatTitle.make('Lisbon weekend')) })),
      )
    }).pipe(Effect.provide(ChatTest)),
  )

  it.effect('updateTitle of a titled chat is ChatTitledError and keeps the title', () =>
    Effect.gen(function* () {
      const service = yield* ChatService
      const renamed = yield* service.rename(owner, chat.id, ChatTitle.make('Trip'))

      const error = yield* Effect.flip(service.updateTitle(chat.id, ChatTitle.make('Lisbon')))

      assertSchemaEquals(ChatTitledError, error, new ChatTitledError({ id: chat.id }))
      assertEquals(yield* selectChat(chat.id), Option.some(renamed))
    }).pipe(Effect.provide(ChatTest)),
  )

  it.effect('updateTitle of a deleted chat is ChatNotFoundError and writes nothing', () =>
    Effect.gen(function* () {
      const service = yield* ChatService
      yield* service.delete(owner, chat.id)

      const error = yield* Effect.flip(service.updateTitle(chat.id, ChatTitle.make('Lisbon')))

      assertSchemaEquals(ChatNotFoundError, error, new ChatNotFoundError({ id: chat.id }))
      assert.deepStrictEqual(yield* selectChat(chat.id), Option.none())
    }).pipe(Effect.provide(ChatTest)),
  )

  it.effect('a rename after updateTitle replaces the generated title', () =>
    Effect.gen(function* () {
      const service = yield* ChatService
      yield* service.updateTitle(chat.id, ChatTitle.make('Lisbon weekend'))

      const renamed = yield* service.rename(owner, chat.id, ChatTitle.make('Trip'))

      assertEquals(yield* selectChat(chat.id), Option.some(renamed))
    }).pipe(Effect.provide(ChatTest)),
  )

  it.effect.each(chatCalls)(
    "$name of another user's chat or of an unknown chat is ChatNotFoundError",
    ({ call }) =>
      Effect.gen(function* () {
        const service = yield* ChatService

        const foreign = yield* Effect.flip(call(service, stranger, chat.id))
        const missing = yield* Effect.flip(call(service, owner, unknownChatId))

        assertSchemaEquals(ChatNotFoundError, foreign, new ChatNotFoundError({ id: chat.id }))
        assertSchemaEquals(ChatNotFoundError, missing, new ChatNotFoundError({ id: unknownChatId }))
        assertEquals(yield* service.get(owner, chat.id), {
          chat,
          activeMessage: Option.none(),
          messages: [],
        })
      }).pipe(Effect.provide(ChatTest)),
  )
})
