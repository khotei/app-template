import { assert, describe, it } from '@effect/vitest'
import { assertEquals } from '@effect/vitest/utils'
import { DateTime, Effect, Layer, Option } from 'effect'

import { Attachment, AttachmentNotFoundError } from '@app-template/domain/attachment'
import {
  buildAssistantMessage,
  buildUserMessage,
  Chat,
  ChatNotFoundError,
  ChatRepository,
  ChatService,
  ChatTitle,
  type Message,
  type MessageId,
  MessageRepository,
  MessageService,
} from '@app-template/domain/chat'
import {
  ask,
  ChatRepositoryTest,
  chat,
  epoch,
  owner,
  stranger,
  upload,
} from '@app-template/domain/testing'
import { recordQueue } from '@app-template/infrastructure/testing'
import { assertSchemaEquals, isUuidV7, sortById } from '@app-template/testing'

import { SendMessageUseCase } from '#application/chat/send-message.use-case'
import {
  ChatTest,
  layerChatTest,
  selectAttachments,
  selectChat,
  selectMessages,
} from '#application/testing/chat.test-layer'

/** Completes an assistant message as the worker would, freeing its chat for the next send. */
const settle = (message: Message) =>
  Effect.gen(function* () {
    const messages = yield* MessageService
    const at = yield* DateTime.now

    const prepared = yield* messages.prepare(message, at)
    return yield* messages.complete(prepared, { text: 'Sure.', at })
  })

/**
 * The memory chat repository whose chat is deleted on the way to its update, as a rival delete
 * between the send's check and its write would.
 */
const ChatRepositoryDeletedBeforeUpdate = Layer.effect(
  ChatRepository,
  Effect.map(ChatRepository, (inner) =>
    ChatRepository.of({
      ...inner,
      update: (set, where) => Effect.andThen(inner.delete(where.id), inner.update(set, where)),
    }),
  ),
).pipe(Layer.provide(ChatRepositoryTest))

const replyJob = (messageId: MessageId) => ({
  queue: 'assistant-message',
  body: `{"chatId":"${chat.id}","messageId":"${messageId}"}`,
  attributes: { jobId: messageId },
})

describe('SendMessageUseCase', () => {
  it.live(
    'send stores the user message with its attachments bound and a queued reply, and moves the chat to the send keeping its title',
    () => {
      const queue = recordQueue()
      return Effect.gen(function* () {
        const chats = yield* ChatService
        const sendMessage = yield* SendMessageUseCase
        const photo = yield* upload(owner)
        yield* chats.rename(owner, chat.id, ChatTitle.make('Trip'))

        const { userMessage, assistantMessage } = yield* sendMessage.send(owner, chat.id, {
          text: 'Plan a weekend in Lisbon',
          attachmentIds: [photo.id],
        })

        const sentAt = userMessage.message.createdAt
        assert.isTrue(DateTime.isGreaterThan(sentAt, epoch))
        assert.isTrue(isUuidV7(userMessage.message.id) && isUuidV7(assistantMessage.message.id))
        const bound = new Attachment({ ...photo, messageId: Option.some(userMessage.message.id) })
        assertEquals(
          { userMessage, assistantMessage },
          {
            userMessage: {
              message: buildUserMessage({
                id: userMessage.message.id,
                chatId: chat.id,
                text: 'Plan a weekend in Lisbon',
                createdAt: sentAt,
              }),
              attachments: [bound],
            },
            assistantMessage: {
              message: buildAssistantMessage({
                id: assistantMessage.message.id,
                chatId: chat.id,
                createdAt: sentAt,
              }),
              attachments: [],
            },
          },
        )
        const stored = yield* selectMessages(chat.id)
        assertEquals(sortById(stored), sortById([userMessage.message, assistantMessage.message]))
        assertEquals(yield* selectAttachments([photo]), [bound])
        assertEquals(
          yield* selectChat(chat.id),
          Option.some(
            new Chat({ ...chat, title: Option.some(ChatTitle.make('Trip')), updatedAt: sentAt }),
          ),
        )
      }).pipe(Effect.provide(ChatTest.pipe(Layer.provide(queue.layer))))
    },
  )

  it.effect(
    'the first send queues the reply and the title jobs, a later one the reply only',
    () => {
      const queue = recordQueue()
      return Effect.gen(function* () {
        const sendMessage = yield* SendMessageUseCase

        const first = yield* sendMessage.send(owner, chat.id, ask('Plan a weekend in Lisbon'))
        yield* settle(first.assistantMessage.message)
        const second = yield* sendMessage.send(owner, chat.id, ask('And in Porto?'))

        assertEquals(yield* queue.sent, [
          replyJob(first.assistantMessage.message.id),
          {
            queue: 'chat-title',
            body: `{"chatId":"${chat.id}","messageId":"${first.userMessage.message.id}"}`,
            attributes: { jobId: chat.id },
          },
          replyJob(second.assistantMessage.message.id),
        ])
      }).pipe(Effect.provide(ChatTest.pipe(Layer.provide(queue.layer))))
    },
  )

  it.effect(
    'send to a chat deleted after the check is ChatNotFoundError and writes nothing',
    () => {
      const queue = recordQueue()
      return Effect.gen(function* () {
        const sendMessage = yield* SendMessageUseCase

        const error = yield* Effect.flip(sendMessage.send(owner, chat.id, ask('Lisbon?')))

        assertSchemaEquals(ChatNotFoundError, error, new ChatNotFoundError({ id: chat.id }))
        assertEquals(yield* selectChat(chat.id), Option.none())
        assertEquals(yield* selectMessages(chat.id), [])
        assertEquals(yield* queue.sent, [])
      }).pipe(
        Effect.provide(
          layerChatTest(ChatRepositoryDeletedBeforeUpdate).pipe(Layer.provide(queue.layer)),
        ),
      )
    },
  )

  it.effect(
    "send with another user's attachment is AttachmentNotFoundError before any reply or job",
    () => {
      const queue = recordQueue()
      return Effect.gen(function* () {
        const sendMessage = yield* SendMessageUseCase
        const messages = yield* MessageRepository
        const photo = yield* upload(stranger)

        const error = yield* Effect.flip(
          sendMessage.send(owner, chat.id, { text: 'Look', attachmentIds: [photo.id] }),
        )

        assertSchemaEquals(
          AttachmentNotFoundError,
          error,
          new AttachmentNotFoundError({ id: photo.id }),
        )
        assertEquals(yield* messages.selectActiveByChat(chat.id), Option.none())
        assertEquals(yield* selectAttachments([photo]), [photo])
        assertEquals(yield* queue.sent, [])
      }).pipe(Effect.provide(ChatTest.pipe(Layer.provide(queue.layer))))
    },
  )
})
