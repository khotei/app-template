import { BunCrypto } from '@effect/platform-bun'
import { assert, describe, it } from '@effect/vitest'
import { assertEquals } from '@effect/vitest/utils'
import { Array as Arr, DateTime, Effect, Layer, Option } from 'effect'

import { assertSchemaEquals } from '@app-template/testing'

import { ChatBusyError, ChatNotFoundError, ChatTitledError } from '#domain/chat/chat.error'
import { ChatId, MessageId } from '#domain/chat/chat.id'
import { buildChat, Chat, ChatTitle } from '#domain/chat/chat.model'
import { ChatRepository } from '#domain/chat/chat.port'
import { ChatService } from '#domain/chat/chat.service'
import { type MessageInputInvalidError, MessageNotFoundError } from '#domain/chat/message.error'
import { buildUserMessage, completeMessage, type Message } from '#domain/chat/message.model'
import { MessageRepository } from '#domain/chat/message.port'
import {
  ask,
  chat,
  epoch,
  unknownChatId,
  unknownMessageId,
} from '#domain/testing/chat.test-fixture'
import { ChatTest, send } from '#domain/testing/chat.test-layer'
import { owner, stranger } from '#domain/testing/user.test-fixture'
import type { UserId } from '#domain/user/user.id'

const ChatBunTest = ChatTest.pipe(Layer.provideMerge(BunCrypto.layer))

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
  { name: 'get', call: (service, userId, chatId) => service.get(userId, chatId) },
  {
    name: 'rename',
    call: (service, userId, chatId) => service.rename(userId, chatId, ChatTitle.make('Trip')),
  },
  {
    name: 'findSendable',
    call: (service, userId, chatId) => service.findSendable(userId, chatId, ask('Lisbon?')),
  },
]

describe('ChatService', () => {
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
    }).pipe(Effect.provide(ChatBunTest)),
  )

  it.effect('updateTitle titles an untitled chat and keeps its updatedAt', () =>
    Effect.gen(function* () {
      const service = yield* ChatService

      yield* service.updateTitle(chat.id, ChatTitle.make('Lisbon weekend'))

      assertEquals(
        yield* selectChat(chat.id),
        Option.some(new Chat({ ...chat, title: Option.some(ChatTitle.make('Lisbon weekend')) })),
      )
    }).pipe(Effect.provide(ChatBunTest)),
  )

  it.effect('updateTitle of a titled chat is ChatTitledError and keeps the title', () =>
    Effect.gen(function* () {
      const service = yield* ChatService
      const renamed = yield* service.rename(owner, chat.id, ChatTitle.make('Trip'))

      const error = yield* service.updateTitle(chat.id, ChatTitle.make('Lisbon')).pipe(Effect.flip)

      assertSchemaEquals(ChatTitledError, error, new ChatTitledError({ id: chat.id }))
      assertEquals(yield* selectChat(chat.id), Option.some(renamed))
    }).pipe(Effect.provide(ChatBunTest)),
  )

  it.effect('updateTitle of a deleted chat is ChatNotFoundError and writes nothing', () =>
    Effect.gen(function* () {
      const service = yield* ChatService
      yield* ChatRepository.use((chats) => chats.delete(chat.id))

      const error = yield* service.updateTitle(chat.id, ChatTitle.make('Lisbon')).pipe(Effect.flip)

      assertSchemaEquals(ChatNotFoundError, error, new ChatNotFoundError({ id: chat.id }))
      assert.deepStrictEqual(yield* selectChat(chat.id), Option.none())
    }).pipe(Effect.provide(ChatBunTest)),
  )

  it.effect('a rename after updateTitle replaces the generated title', () =>
    Effect.gen(function* () {
      const service = yield* ChatService
      yield* service.updateTitle(chat.id, ChatTitle.make('Lisbon weekend'))

      const renamed = yield* service.rename(owner, chat.id, ChatTitle.make('Trip'))

      assertEquals(yield* selectChat(chat.id), Option.some(renamed))
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
        assertEquals(yield* service.get(owner, chat.id), {
          chat,
          activeMessage: Option.none(),
          messages: [],
        })
      }).pipe(Effect.provide(ChatBunTest)),
  )

  it.effect('getMessage returns the stored message', () =>
    Effect.gen(function* () {
      const service = yield* ChatService
      const { userMessage } = yield* send(owner, chat.id, 'Lisbon?')

      assertEquals(yield* service.getMessage(owner, chat.id, userMessage.id), {
        message: userMessage,
        attachments: [],
      })
    }).pipe(Effect.provide(ChatBunTest)),
  )

  it.effect(
    "getMessage of an unknown id, of another chat's message or of a stranger's chat is MessageNotFoundError",
    () =>
      Effect.gen(function* () {
        const service = yield* ChatService
        const other = buildChat({
          id: ChatId.make('0192d4e0-7b3a-7c00-8000-000000000021'),
          userId: owner,
          createdAt: epoch,
        })
        yield* ChatRepository.use((chats) => chats.insert(other))
        const { userMessage } = yield* send(owner, other.id, 'Lisbon?')

        const elsewhere = yield* service
          .getMessage(owner, chat.id, userMessage.id)
          .pipe(Effect.flip)
        const foreign = yield* service
          .getMessage(stranger, other.id, userMessage.id)
          .pipe(Effect.flip)
        const missing = yield* service
          .getMessage(owner, chat.id, unknownMessageId)
          .pipe(Effect.flip)

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
      }).pipe(Effect.provide(ChatBunTest)),
  )
})
