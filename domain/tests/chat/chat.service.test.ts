import { BunCrypto } from '@effect/platform-bun'
import { assert, describe, it } from '@effect/vitest'
import { assertEquals } from '@effect/vitest/utils'
import { Array as Arr, DateTime, Duration, Effect, Layer, Option } from 'effect'

import { assertSchemaEquals, isUuidV7 } from '@app-template/testing'

import { ChatBusyError, ChatNotFoundError, ChatTitledError } from '#domain/chat/chat.error'
import { ChatId } from '#domain/chat/chat.id'
import { buildChat, Chat, ChatTitle } from '#domain/chat/chat.model'
import { ChatRepository } from '#domain/chat/chat.port'
import { ChatService } from '#domain/chat/chat.service'
import { type MessageInputInvalidError, MessageNotFoundError } from '#domain/chat/message.error'
import { completeMessage, type Message, prepareMessage } from '#domain/chat/message.model'
import { MessageRepository } from '#domain/chat/message.port'
import {
  ask,
  chat,
  epoch,
  unknownChatId,
  unknownMessageId,
} from '#domain/testing/chat.test-fixture'
import { RepositoryStackTest } from '#domain/testing/index'
import { owner, stranger } from '#domain/testing/user.test-fixture'
import type { UserId } from '#domain/user/user.id'

const insertChat = Layer.effectDiscard(
  Effect.flatMap(ChatRepository, (chats) => chats.insert(chat)),
)

/** The service over the memory layers, on fresh rows where `chat` exists. */
const ChatServiceTest = ChatService.layer.pipe(
  Layer.provideMerge(insertChat),
  Layer.provideMerge(RepositoryStackTest),
  Layer.provide(BunCrypto.layer),
)

/** Stores a user message with its queued reply, as a send does. */
const send = (userId: UserId, chatId: ChatId, text: string) =>
  Effect.gen(function* () {
    const service = yield* ChatService

    const sendable = yield* service.findSendable(userId, chatId, ask(text))
    const userMessage = yield* service.addUserMessage(sendable)
    const assistantMessage = yield* service.addAssistantMessage(sendable)
    return { userMessage, assistantMessage }
  })

/** Completes an assistant message as the worker would, freeing its chat for the next send. */
const settle = (message: Message) =>
  Effect.gen(function* () {
    const messages = yield* MessageRepository
    const at = yield* DateTime.now

    const prepared = yield* prepareMessage(message, at)
    const completed = yield* completeMessage(prepared, { text: 'Sure.', at })
    yield* messages.update(completed, { stage: message.stage })
  })

const selectChat = (chatId: ChatId) =>
  Effect.flatMap(ChatRepository, (chats) => chats.selectOne({ id: chatId }))

const selectMessages = (chatId: ChatId) =>
  Effect.flatMap(MessageRepository, (messages) => messages.selectByChat(chatId)).pipe(
    Effect.map(Arr.map(({ message }) => message)),
  )

type ChatCall = (
  service: ChatService['Service'],
  userId: UserId,
  chatId: ChatId,
) => Effect.Effect<unknown, ChatNotFoundError | ChatBusyError | MessageInputInvalidError>

const chatCalls = [
  { name: 'get', call: (service, userId, chatId) => service.get(userId, chatId) },
  {
    name: 'rename',
    call: (service, userId, chatId) => service.rename(userId, chatId, ChatTitle.make('Trip')),
  },
  { name: 'delete', call: (service, userId, chatId) => service.delete(userId, chatId) },
  {
    name: 'findSendable',
    call: (service, userId, chatId) => service.findSendable(userId, chatId, ask('Lisbon?')),
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
    }).pipe(Effect.provide(ChatServiceTest)),
  )

  it.live("list puts the last sent chat first with its active message, and only the user's", () =>
    Effect.gen(function* () {
      const service = yield* ChatService
      const chats = yield* ChatRepository
      const later = buildChat({
        id: ChatId.make('0192d4e0-7b3a-7c00-8000-000000000021'),
        userId: owner,
        createdAt: DateTime.addDuration(epoch, Duration.millis(1)),
      })
      yield* chats.insert(later)
      yield* service.create(stranger)

      const { assistantMessage } = yield* send(owner, chat.id, 'Lisbon?')

      const summaries = yield* service.list(owner)
      assertEquals(
        Arr.map(summaries, (summary) => [summary.chat.id, summary.activeMessage]),
        [
          [chat.id, Option.some(assistantMessage)],
          [later.id, Option.none()],
        ],
      )
    }).pipe(Effect.provide(ChatServiceTest)),
  )

  it.effect('get returns the chat with its messages and the active message', () =>
    Effect.gen(function* () {
      const service = yield* ChatService
      const first = yield* send(owner, chat.id, 'Lisbon?')
      yield* settle(first.assistantMessage)
      const second = yield* send(owner, chat.id, 'And now?')

      const detail = yield* service.get(owner, chat.id)

      assert.sameMembers(
        Arr.map(detail.messages, ({ message }) => message.id),
        [
          first.userMessage.id,
          first.assistantMessage.id,
          second.userMessage.id,
          second.assistantMessage.id,
        ],
      )
      assertEquals(detail.activeMessage, Option.some(second.assistantMessage))
      assert.strictEqual(detail.chat.id, chat.id)
    }).pipe(Effect.provide(ChatServiceTest)),
  )

  it.effect('getMessage returns the stored message', () =>
    Effect.gen(function* () {
      const service = yield* ChatService
      const { userMessage } = yield* send(owner, chat.id, 'Lisbon?')

      assertEquals(yield* service.getMessage(owner, chat.id, userMessage.id), {
        message: userMessage,
        attachments: [],
      })
    }).pipe(Effect.provide(ChatServiceTest)),
  )

  it.effect(
    "getMessage of an unknown id, of another chat's message or of a stranger's chat is MessageNotFoundError",
    () =>
      Effect.gen(function* () {
        const service = yield* ChatService
        const other = yield* service.create(owner)
        const { userMessage } = yield* send(owner, other.id, 'Lisbon?')

        const elsewhere = yield* Effect.flip(service.getMessage(owner, chat.id, userMessage.id))
        const foreign = yield* Effect.flip(service.getMessage(stranger, other.id, userMessage.id))
        const missing = yield* Effect.flip(service.getMessage(owner, chat.id, unknownMessageId))

        assertSchemaEquals(
          MessageNotFoundError,
          elsewhere,
          new MessageNotFoundError({ id: userMessage.id }),
        )
        assertSchemaEquals(
          MessageNotFoundError,
          foreign,
          new MessageNotFoundError({ id: userMessage.id }),
        )
        assertSchemaEquals(
          MessageNotFoundError,
          missing,
          new MessageNotFoundError({ id: unknownMessageId }),
        )
      }).pipe(Effect.provide(ChatServiceTest)),
  )

  it.effect('findSendable says the first send opens the chat, and no later one', () =>
    Effect.gen(function* () {
      const service = yield* ChatService

      const opening = yield* service.findSendable(owner, chat.id, ask('Lisbon?'))
      yield* service.addUserMessage(opening)
      const next = yield* service.findSendable(owner, chat.id, ask('And now?'))

      assert.deepStrictEqual([opening.opensChat, next.opensChat], [true, false])
    }).pipe(Effect.provide(ChatServiceTest)),
  )

  it.effect('findSendable while a reply runs is ChatBusyError', () =>
    Effect.gen(function* () {
      const service = yield* ChatService
      yield* send(owner, chat.id, 'Lisbon?')

      const busy = yield* Effect.flip(service.findSendable(owner, chat.id, ask('And now?')))

      assertSchemaEquals(ChatBusyError, busy, new ChatBusyError({ id: chat.id }))
    }).pipe(Effect.provide(ChatServiceTest)),
  )

  it.effect('addAssistantMessage on a chat that has an active message is ChatBusyError', () =>
    Effect.gen(function* () {
      const service = yield* ChatService
      const sendable = yield* service.findSendable(owner, chat.id, ask('Lisbon?'))
      const first = yield* service.addAssistantMessage(sendable)

      const busy = yield* Effect.flip(service.addAssistantMessage(sendable))

      assertSchemaEquals(ChatBusyError, busy, new ChatBusyError({ id: chat.id }))
      assertEquals(yield* selectMessages(chat.id), [first])
    }).pipe(Effect.provide(ChatServiceTest)),
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
    }).pipe(Effect.provide(ChatServiceTest)),
  )

  it.effect('addUserMessage on a chat deleted since findSendable is ChatNotFoundError', () =>
    Effect.gen(function* () {
      const service = yield* ChatService
      const sendable = yield* service.findSendable(owner, chat.id, ask('Lisbon?'))
      yield* service.delete(owner, chat.id)

      const error = yield* Effect.flip(service.addUserMessage(sendable))

      assertSchemaEquals(ChatNotFoundError, error, new ChatNotFoundError({ id: chat.id }))
      assertEquals(yield* selectMessages(chat.id), [])
    }).pipe(Effect.provide(ChatServiceTest)),
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
    }).pipe(Effect.provide(ChatServiceTest)),
  )

  it.effect('updateTitle titles an untitled chat and keeps its updatedAt', () =>
    Effect.gen(function* () {
      const service = yield* ChatService

      yield* service.updateTitle(chat.id, ChatTitle.make('Lisbon weekend'))

      assertEquals(
        yield* selectChat(chat.id),
        Option.some(new Chat({ ...chat, title: Option.some(ChatTitle.make('Lisbon weekend')) })),
      )
    }).pipe(Effect.provide(ChatServiceTest)),
  )

  it.effect('updateTitle of a titled chat is ChatTitledError and keeps the title', () =>
    Effect.gen(function* () {
      const service = yield* ChatService
      const renamed = yield* service.rename(owner, chat.id, ChatTitle.make('Trip'))

      const error = yield* Effect.flip(service.updateTitle(chat.id, ChatTitle.make('Lisbon')))

      assertSchemaEquals(ChatTitledError, error, new ChatTitledError({ id: chat.id }))
      assertEquals(yield* selectChat(chat.id), Option.some(renamed))
    }).pipe(Effect.provide(ChatServiceTest)),
  )

  it.effect('updateTitle of a deleted chat is ChatNotFoundError and writes nothing', () =>
    Effect.gen(function* () {
      const service = yield* ChatService
      yield* service.delete(owner, chat.id)

      const error = yield* Effect.flip(service.updateTitle(chat.id, ChatTitle.make('Lisbon')))

      assertSchemaEquals(ChatNotFoundError, error, new ChatNotFoundError({ id: chat.id }))
      assert.deepStrictEqual(yield* selectChat(chat.id), Option.none())
    }).pipe(Effect.provide(ChatServiceTest)),
  )

  it.effect('a rename after updateTitle replaces the generated title', () =>
    Effect.gen(function* () {
      const service = yield* ChatService
      yield* service.updateTitle(chat.id, ChatTitle.make('Lisbon weekend'))

      const renamed = yield* service.rename(owner, chat.id, ChatTitle.make('Trip'))

      assertEquals(yield* selectChat(chat.id), Option.some(renamed))
    }).pipe(Effect.provide(ChatServiceTest)),
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
      }).pipe(Effect.provide(ChatServiceTest)),
  )
})
