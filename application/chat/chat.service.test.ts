import { assert, describe, it } from '@effect/vitest'
import { assertEquals } from '@effect/vitest/utils'
import { Array as Arr, DateTime, Effect, Option, Record as Rec } from 'effect'
import { TestClock } from 'effect/testing'

import {
  buildChat,
  Chat,
  type ChatId,
  ChatNotFoundError,
  ChatTitle,
  MessageNotFoundError,
} from '@app-template/domain/chat'
import type { UserId } from '@app-template/domain/user'
import { isUuidV7 } from '@app-template/testing'

import { ChatService } from '#application/chat/chat.service'
import { ask, sentAt, unknownChatId, unknownMessageId } from '#application/testing/chat.fixture'
import {
  makeChatHarness,
  selectChat,
  settle,
  upload,
  withChat,
} from '#application/testing/chat.harness'
import { owner, stranger } from '#application/testing/user.fixture'

type ChatCall = (
  service: ChatService['Service'],
  userId: UserId,
  chatId: ChatId,
) => Effect.Effect<unknown, unknown>

const chatCalls = {
  get: (service, userId, chatId) => service.get(userId, chatId),
  rename: (service, userId, chatId) => service.rename(userId, chatId, ChatTitle.make('Trip')),
  delete: (service, userId, chatId) => service.delete(userId, chatId),
  getMessage: (service, userId, chatId) => service.getMessage(userId, chatId, unknownMessageId),
} as const satisfies Record<string, ChatCall>

describe('ChatService', () => {
  it.effect('create stores an untitled chat with a UUIDv7 id at the clock time', () => {
    const { layer } = makeChatHarness()
    return Effect.gen(function* () {
      const service = yield* ChatService
      yield* TestClock.setTime(DateTime.toEpochMillis(sentAt))

      const chat = yield* service.create(owner)

      assert.isTrue(isUuidV7(chat.id))
      assertEquals(chat, buildChat({ id: chat.id, userId: owner, createdAt: sentAt }))
      assertEquals(yield* service.list(owner), [{ chat, activeMessage: Option.none() }])
    }).pipe(Effect.provide(layer))
  })

  it.effect("list puts the last sent chat first with its active message, and only the user's", () =>
    withChat(({ chat: untouched, chats: service, sendMessage }) =>
      Effect.gen(function* () {
        const sentTo = yield* service.create(owner)
        yield* service.create(stranger)
        yield* TestClock.adjust('1 second')

        const { assistantMessage } = yield* sendMessage.send(owner, sentTo.id, ask('Lisbon?'))

        const summaries = yield* service.list(owner)
        assertEquals(
          Arr.map(summaries, ({ chat, activeMessage }) => [chat.id, activeMessage]),
          [
            [sentTo.id, Option.some(assistantMessage.message)],
            [untouched.id, Option.none()],
          ],
        )
      }),
    ),
  )

  it.effect('get returns the messages in order with their attachments and the active message', () =>
    withChat(({ chat, chats: service, sendMessage }) =>
      Effect.gen(function* () {
        const photo = yield* upload(owner, 'photo.png')
        const first = yield* sendMessage.send(owner, chat.id, {
          text: 'Look',
          attachmentIds: [photo.id],
        })
        yield* settle(first.assistantMessage.message)
        const second = yield* sendMessage.send(owner, chat.id, ask('And now?'))

        const detail = yield* service.get(owner, chat.id)

        assertEquals(
          Arr.map(detail.messages, ({ message, attachments }) => [message.id, attachments]),
          [
            [first.userMessage.message.id, first.userMessage.attachments],
            [first.assistantMessage.message.id, []],
            [second.userMessage.message.id, []],
            [second.assistantMessage.message.id, []],
          ],
        )
        assertEquals(detail.activeMessage, Option.some(second.assistantMessage.message))
        assert.strictEqual(detail.chat.id, chat.id)
      }),
    ),
  )

  it.effect('getMessage returns the stored message with its attachments', () =>
    withChat(({ chat, chats: service, sendMessage }) =>
      Effect.gen(function* () {
        const photo = yield* upload(owner, 'photo.png')
        const { userMessage } = yield* sendMessage.send(owner, chat.id, {
          text: 'Look',
          attachmentIds: [photo.id],
        })

        assertEquals(yield* service.getMessage(owner, chat.id, userMessage.message.id), userMessage)
      }),
    ),
  )

  it.effect("getMessage in another user's chat is ChatNotFoundError", () =>
    withChat(({ chat, chats: service, sendMessage }) =>
      Effect.gen(function* () {
        const { userMessage } = yield* sendMessage.send(owner, chat.id, ask('Lisbon?'))

        const error = yield* Effect.flip(
          service.getMessage(stranger, chat.id, userMessage.message.id),
        )

        assertEquals(error, new ChatNotFoundError({ id: chat.id }))
      }),
    ),
  )

  it.effect('getMessage of an unknown id or of another chat is MessageNotFoundError', () =>
    withChat(({ chat, chats: service, sendMessage }) =>
      Effect.gen(function* () {
        const other = yield* service.create(owner)
        const { userMessage } = yield* sendMessage.send(owner, other.id, ask('Lisbon?'))

        const elsewhere = yield* Effect.flip(
          service.getMessage(owner, chat.id, userMessage.message.id),
        )
        const missing = yield* Effect.flip(service.getMessage(owner, chat.id, unknownMessageId))

        assertEquals(elsewhere, new MessageNotFoundError({ id: userMessage.message.id }))
        assertEquals(missing, new MessageNotFoundError({ id: unknownMessageId }))
      }),
    ),
  )

  it.effect('rename sets the title and bumps updatedAt', () =>
    withChat(({ chat, chats: service }) =>
      Effect.gen(function* () {
        yield* TestClock.setTime(DateTime.toEpochMillis(sentAt))

        const renamed = yield* service.rename(owner, chat.id, ChatTitle.make('Trip'))

        assertEquals(
          renamed,
          new Chat({ ...chat, title: Option.some(ChatTitle.make('Trip')), updatedAt: sentAt }),
        )
        assertEquals(yield* selectChat(chat.id), Option.some(renamed))
      }),
    ),
  )

  it.effect.each(Rec.keys(chatCalls))(
    "%s of another user's chat or of an unknown chat is ChatNotFoundError",
    (method) =>
      withChat(({ chat, chats: service }) =>
        Effect.gen(function* () {
          const call: ChatCall = chatCalls[method]

          const foreign = yield* Effect.flip(call(service, stranger, chat.id))
          const missing = yield* Effect.flip(call(service, owner, unknownChatId))

          assertEquals(foreign, new ChatNotFoundError({ id: chat.id }))
          assertEquals(missing, new ChatNotFoundError({ id: unknownChatId }))
          assertEquals(yield* service.get(owner, chat.id), {
            chat,
            activeMessage: Option.none(),
            messages: [],
          })
        }),
      ),
  )
})
