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
import type { MessageInputInvalidError } from '#domain/chat/message.error'
import type { Message } from '#domain/chat/message.model'
import { MessageService } from '#domain/chat/message.service'
import { ask, chat, epoch, unknownChatId } from '#domain/testing/chat.test-fixture'
import { ChatTest, send } from '#domain/testing/chat.test-layer'
import { owner, stranger } from '#domain/testing/user.test-fixture'
import type { UserId } from '#domain/user/user.id'

const ChatBunTest = ChatTest.pipe(Layer.provide(BunCrypto.layer))

/** Completes an assistant message as the worker would, freeing its chat for the next send. */
const settle = (message: Message) =>
  Effect.gen(function* () {
    const messages = yield* MessageService
    const at = yield* DateTime.now

    const prepared = yield* messages.prepare(message, at)
    return yield* messages.complete(prepared, { text: 'Sure.', at })
  })

const selectChat = (chatId: ChatId) =>
  ChatRepository.use((chats) => chats.selectOne({ id: chatId }))

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
    }).pipe(Effect.provide(ChatBunTest)),
  )

  it.live(
    "rename makes the chat the last active one in list, which shows each active message and only the user's chats",
    () =>
      Effect.gen(function* () {
        const service = yield* ChatService
        const chats = yield* ChatRepository
        const createdAfter = (millis: number) =>
          DateTime.addDuration(epoch, Duration.millis(millis))
        const second = buildChat({
          id: ChatId.make('0192d4e0-7b3a-7c00-8000-000000000021'),
          userId: owner,
          createdAt: createdAfter(1),
        })
        const third = buildChat({
          id: ChatId.make('0192d4e0-7b3a-7c00-8000-000000000022'),
          userId: owner,
          createdAt: createdAfter(2),
        })
        yield* chats.insert(second)
        yield* chats.insert(third)
        yield* service.create(stranger)
        const { assistantMessage } = yield* send(owner, third.id, 'Lisbon?')

        yield* service.rename(owner, second.id, ChatTitle.make('Trip'))

        const summaries = yield* service.list(owner)
        assertEquals(
          Arr.map(summaries, (summary) => [summary.chat.id, summary.activeMessage]),
          [
            [second.id, Option.none()],
            [third.id, Option.some(assistantMessage)],
            [chat.id, Option.none()],
          ],
        )
      }).pipe(Effect.provide(ChatBunTest)),
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
    }).pipe(Effect.provide(ChatBunTest)),
  )

  it.effect('findSendable says the first send opens the chat, and no later one', () =>
    Effect.gen(function* () {
      const service = yield* ChatService
      const messages = yield* MessageService

      const opening = yield* service.findSendable(owner, chat.id, ask('Lisbon?'))
      yield* messages.addUserMessage(opening)
      const next = yield* service.findSendable(owner, chat.id, ask('And now?'))

      assert.deepStrictEqual([opening.opensChat, next.opensChat], [true, false])
    }).pipe(Effect.provide(ChatBunTest)),
  )

  it.effect('findSendable while a reply runs is ChatBusyError', () =>
    Effect.gen(function* () {
      const service = yield* ChatService
      yield* send(owner, chat.id, 'Lisbon?')

      const busy = yield* Effect.flip(service.findSendable(owner, chat.id, ask('And now?')))

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

      const error = yield* Effect.flip(service.updateTitle(chat.id, ChatTitle.make('Lisbon')))

      assertSchemaEquals(ChatTitledError, error, new ChatTitledError({ id: chat.id }))
      assertEquals(yield* selectChat(chat.id), Option.some(renamed))
    }).pipe(Effect.provide(ChatBunTest)),
  )

  it.effect('updateTitle of a deleted chat is ChatNotFoundError and writes nothing', () =>
    Effect.gen(function* () {
      const service = yield* ChatService
      yield* service.delete(owner, chat.id)

      const error = yield* Effect.flip(service.updateTitle(chat.id, ChatTitle.make('Lisbon')))

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

        const foreign = yield* Effect.flip(call(service, stranger, chat.id))
        const missing = yield* Effect.flip(call(service, owner, unknownChatId))

        assertSchemaEquals(ChatNotFoundError, foreign, new ChatNotFoundError({ id: chat.id }))
        assertSchemaEquals(ChatNotFoundError, missing, new ChatNotFoundError({ id: unknownChatId }))
        assertEquals(yield* service.get(owner, chat.id), {
          chat,
          activeMessage: Option.none(),
          messages: [],
        })
      }).pipe(Effect.provide(ChatBunTest)),
  )
})
