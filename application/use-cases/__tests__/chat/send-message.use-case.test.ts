import { assert, describe, it } from '@effect/vitest'
import { assertEquals } from '@effect/vitest/utils'
import { Array as Arr, DateTime, Effect, Layer, Option, Order } from 'effect'

import {
  Attachment,
  AttachmentBoundError,
  AttachmentNotFoundError,
  buildAssistantMessage,
  buildUserMessage,
  Chat,
  ChatBusyError,
  ChatTitle,
  completeMessage,
  GenerateAssistantMessage,
  GenerateChatTitle,
  Message,
  type MessageId,
  type MessageInput,
} from '@app-template/application/chat'
import {
  chat,
  owner,
  replyProvenance,
  selectAttachments,
  selectChat,
  selectMessages,
  stranger,
  updateMessage,
  upload,
} from '@app-template/application/chat/testing'
import { ChatRepository } from '@app-template/kernel/data'
import { recordQueue } from '@app-template/packages/queue/testing'
import { assertSchemaEquals, epoch, isUuidV7 } from '@app-template/packages/testing'

import { ChatTest } from '#testing/use-cases/chat.test-layer'
import { SendMessageUseCase } from '#use-cases/chat/send-message.use-case'

const ask = (text: string): MessageInput => ({ text, attachmentIds: [] })

/** Completes an assistant message as the worker would, freeing its chat for the next send. */
const settle = (message: Message) =>
  Effect.gen(function* () {
    const chats = yield* ChatRepository
    const at = yield* DateTime.now

    const completed = yield* completeMessage(message, { text: 'Sure.', at })
    yield* updateMessage(completed)
    yield* chats.update({ status: 'idle' }, { id: message.chatId, status: 'queued' })
    return completed
  })

const replyJob = (messageId: MessageId) => ({
  queue: 'assistant-message',
  jobId: messageId,
  job: new GenerateAssistantMessage({
    chatId: chat.id,
    messageId,
    provenance: Option.some(replyProvenance),
  }),
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
        yield* chats.update({ title: 'Trip' }, { id: chat.id })

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
        assertEquals(
          stored,
          Arr.sortWith([userMessage, assistantMessage], (message) => message.id, Order.String),
        )
        assertEquals(yield* selectAttachments([photo.id]), [bound])
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
    "the first send queues the reply job with the process's provenance and the title job, a later one the reply only",
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
            jobId: chat.id,
            job: new GenerateChatTitle({ chatId: chat.id, messageId: first.userMessage.id }),
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
    'send with an attachment bound already is AttachmentBoundError before any message',
    () => {
      const queue = recordQueue()
      return Effect.gen(function* () {
        const sendMessage = yield* SendMessageUseCase
        const photo = yield* upload(owner)
        const first = yield* sendMessage.send(owner, chat.id, {
          text: 'Look',
          attachmentIds: [photo.id],
        })
        yield* settle(first.assistantMessage)

        const error = yield* sendMessage
          .send(owner, chat.id, { text: 'Again', attachmentIds: [photo.id] })
          .pipe(Effect.flip)

        assertSchemaEquals(AttachmentBoundError, error, new AttachmentBoundError({ id: photo.id }))
        assert.lengthOf(yield* selectMessages(chat.id), 2)
      }).pipe(Effect.provide(Layer.provide(ChatTest, queue.layer)))
    },
  )

  it.effect(
    "send with another user's attachment is AttachmentNotFoundError before any message or job",
    () => {
      const queue = recordQueue()
      return Effect.gen(function* () {
        const sendMessage = yield* SendMessageUseCase
        const photo = yield* upload(stranger)

        const error = yield* sendMessage
          .send(owner, chat.id, { text: 'Look', attachmentIds: [photo.id] })
          .pipe(Effect.flip)

        assertSchemaEquals(
          AttachmentNotFoundError,
          error,
          new AttachmentNotFoundError({ ids: [photo.id] }),
        )
        assertEquals(yield* selectMessages(chat.id), [])
        assertEquals(yield* selectAttachments([photo.id]), [photo])
        assertEquals(yield* queue.sent, [])
      }).pipe(Effect.provide(Layer.provide(ChatTest, queue.layer)))
    },
  )
})
