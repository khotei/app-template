import { assert, describe, it } from '@effect/vitest'
import { assertEquals } from '@effect/vitest/utils'
import { DateTime, Effect, Layer, Option } from 'effect'

import { Attachment, AttachmentNotFoundError } from '@app-template/domain/attachment'
import {
  activeMessageWhere,
  buildAssistantMessage,
  buildUserMessage,
  Chat,
  ChatBusyError,
  ChatRepository,
  ChatTitle,
  completeMessage,
  Message,
  type MessageId,
  MessageRepository,
} from '@app-template/domain/chat'
import { ask, chat, epoch, owner, stranger, upload } from '@app-template/domain/testing'
import { recordQueue } from '@app-template/queue/testing'
import { assertSchemaEquals, isUuidV7, sortById } from '@app-template/testing'

import { SendMessageUseCase } from '#application/chat/send-message.use-case'
import {
  ChatTest,
  selectAttachments,
  selectChat,
  selectMessages,
} from '#application/testing/chat.test-layer'

/** Completes an assistant message as the worker would, freeing its chat for the next send. */
const settle = (message: Message) =>
  Effect.gen(function* () {
    const chats = yield* ChatRepository
    const messages = yield* MessageRepository
    const at = yield* DateTime.now

    const completed = yield* completeMessage(message, { text: 'Sure.', at })
    yield* messages.update(completed, { status: message.status })
    yield* chats.update({ status: 'idle' }, { id: message.chatId, status: 'queued' })
    return completed
  })

const replyJob = (messageId: MessageId) => ({
  queue: 'assistant-message',
  body: `{"chatId":"${chat.id}","messageId":"${messageId}"}`,
  attributes: { jobId: messageId },
})

describe('SendMessageUseCase', () => {
  it.live(
    'send stores the user message with its attachments bound and a queued reply, and queues the chat keeping its title',
    () => {
      const queue = recordQueue()
      return Effect.gen(function* () {
        const chats = yield* ChatRepository
        const sendMessage = yield* SendMessageUseCase
        const photo = yield* upload(owner)
        yield* chats.update({ title: Option.some(ChatTitle.make('Trip')) }, { id: chat.id })

        const { userMessage, assistantMessage } = yield* sendMessage.send(owner, chat.id, {
          text: 'Plan a weekend in Lisbon',
          attachmentIds: [photo.id],
        })

        const sentAt = userMessage.createdAt
        assert.isTrue(DateTime.isGreaterThan(sentAt, epoch))
        assert.isTrue(isUuidV7(userMessage.id) && isUuidV7(assistantMessage.id))
        const bound = new Attachment({
          ...photo,
          messageId: Option.some(userMessage.id),
          chatId: Option.some(chat.id),
        })
        assertEquals(
          { userMessage, assistantMessage },
          {
            userMessage: new Message({
              ...buildUserMessage({
                id: userMessage.id,
                chatId: chat.id,
                text: 'Plan a weekend in Lisbon',
                createdAt: sentAt,
              }),
              attachments: [bound],
            }),
            assistantMessage: buildAssistantMessage({
              id: assistantMessage.id,
              chatId: chat.id,
              createdAt: sentAt,
            }),
          },
        )
        const stored = yield* selectMessages(chat.id)
        assertEquals(sortById(stored), sortById([userMessage, assistantMessage]))
        assertEquals(yield* selectAttachments([photo]), [bound])
        assertEquals(
          yield* selectChat(chat.id),
          Option.some(
            new Chat({
              ...chat,
              title: Option.some(ChatTitle.make('Trip')),
              status: 'queued',
              attachments: [bound],
            }),
          ),
        )
      }).pipe(Effect.provide(Layer.provide(ChatTest, queue.layer)))
    },
  )

  it.effect(
    'the first send queues the reply and the title jobs, a later one the reply only',
    () => {
      const queue = recordQueue()
      return Effect.gen(function* () {
        const sendMessage = yield* SendMessageUseCase

        const first = yield* sendMessage.send(owner, chat.id, ask('Plan a weekend in Lisbon'))
        yield* settle(first.assistantMessage)
        const second = yield* sendMessage.send(owner, chat.id, ask('And in Porto?'))

        assertEquals(yield* queue.sent, [
          replyJob(first.assistantMessage.id),
          {
            queue: 'chat-title',
            body: `{"chatId":"${chat.id}","messageId":"${first.userMessage.id}"}`,
            attributes: { jobId: chat.id },
          },
          replyJob(second.assistantMessage.id),
        ])
      }).pipe(Effect.provide(Layer.provide(ChatTest, queue.layer)))
    },
  )

  it.effect('send while a reply runs is ChatBusyError before any message or job', () => {
    const queue = recordQueue()
    return Effect.gen(function* () {
      const sendMessage = yield* SendMessageUseCase
      yield* sendMessage.send(owner, chat.id, ask('Plan a weekend in Lisbon'))

      const error = yield* sendMessage.send(owner, chat.id, ask('And in Porto?')).pipe(Effect.flip)

      assertSchemaEquals(ChatBusyError, error, new ChatBusyError({ id: chat.id }))
      assert.lengthOf(yield* selectMessages(chat.id), 2)
      assert.lengthOf(yield* queue.sent, 2)
    }).pipe(Effect.provide(Layer.provide(ChatTest, queue.layer)))
  })

  it.effect(
    "send with another user's attachment is AttachmentNotFoundError before any reply or job",
    () => {
      const queue = recordQueue()
      return Effect.gen(function* () {
        const sendMessage = yield* SendMessageUseCase
        const messages = yield* MessageRepository
        const photo = yield* upload(stranger)

        const error = yield* sendMessage
          .send(owner, chat.id, { text: 'Look', attachmentIds: [photo.id] })
          .pipe(Effect.flip)

        assertSchemaEquals(
          AttachmentNotFoundError,
          error,
          new AttachmentNotFoundError({ id: photo.id }),
        )
        assertEquals(yield* messages.selectMany({ chatId: [chat.id], ...activeMessageWhere }), [])
        assertEquals(yield* selectAttachments([photo]), [photo])
        assertEquals(yield* queue.sent, [])
      }).pipe(Effect.provide(Layer.provide(ChatTest, queue.layer)))
    },
  )
})
