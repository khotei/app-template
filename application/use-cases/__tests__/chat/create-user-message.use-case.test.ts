import { assert, describe, it } from '@effect/vitest'
import { assertEquals } from '@effect/vitest/utils'
import { Array as Arr, DateTime, Effect, Layer, Option, Struct } from 'effect'

import {
  Attachment,
  AttachmentBoundError,
  AttachmentNotFoundError,
  buildAssistantMessage,
  buildRun,
  buildUserMessage,
  Chat,
  ChatBusyError,
  type ChatId,
  ChatService,
  ChatTitle,
  completeRun,
  GenerateAssistantMessage,
  GenerateChatTitle,
  Message,
  MessageId,
  type MessageInput,
  type Run,
  type RunId,
} from '@app-template/application/chat'
import {
  chat,
  insertMessage,
  owner,
  replyProvenance,
  selectAttachments,
  selectChat,
  selectMessages,
  stranger,
  updateRun,
  upload,
} from '@app-template/application/chat/testing'
import { ChatRepository, FileRepository } from '@app-template/kernel/data'
import { recordMessages } from '@app-template/packages/queue/testing'
import { assertSchemaEquals, epoch, isUuidV7 } from '@app-template/packages/testing'

import { ChatTest } from '#testing/use-cases/chat.test-layer'
import { CreateUserMessageUseCase } from '#use-cases/chat/create-user-message.use-case'

/** The one attachment the chat's messages hold. */
const selectSentAttachment = (chatId: ChatId) =>
  selectMessages(chatId).pipe(Effect.map(Arr.flatMap(Struct.get('attachments'))), Effect.head)

const ask = (text: string): MessageInput => ({ text, attachmentIds: [] })

/** Settles a Run as done with its reply, as the worker would, freeing its chat for the next create. */
const settle = (run: Run) =>
  Effect.gen(function* () {
    const at = yield* DateTime.now
    // The Run's id serves its reply too: one reply per Run, so no two collide.
    const reply = buildAssistantMessage({
      id: MessageId.make(run.id),
      chatId: run.chatId,
      text: 'Sure.',
      createdAt: at,
    })

    yield* insertMessage(reply)
    yield* completeRun(run, { reply, at }).pipe(Effect.flatMap(updateRun))
  })

const replyJob = (runId: RunId) => ({
  queue: 'assistant-message',
  message: new GenerateAssistantMessage({ chatId: chat.id, runId }),
})

describe('CreateUserMessageUseCase', () => {
  it.live(
    'create stores the user message with a record of its library attachment and its queued Run, keeping the title',
    () => {
      const jobs = recordMessages()
      return Effect.gen(function* () {
        const chats = yield* ChatRepository
        const createUserMessage = yield* CreateUserMessageUseCase
        const photo = yield* upload(owner)
        yield* chats.update({ title: 'Trip' }, { id: chat.id })

        const run = yield* createUserMessage.create(owner, chat.id, {
          text: 'Plan a weekend in Lisbon',
          attachmentIds: [photo.id],
        })

        const { userMessage } = run
        const sentAt = userMessage.createdAt
        assert.isTrue(DateTime.isGreaterThan(sentAt, epoch))
        assert.isTrue(DateTime.isGreaterThanOrEqualTo(run.createdAt, sentAt))
        assert.isTrue(isUuidV7(userMessage.id) && isUuidV7(run.id))
        const sent = yield* selectSentAttachment(chat.id)
        assert.isTrue(isUuidV7(sent.id) && DateTime.isGreaterThan(sent.createdAt, epoch))
        const record = new Attachment({
          ...photo,
          id: sent.id,
          messageId: Option.some(userMessage.id),
          chatId: Option.some(chat.id),
          sourceId: Option.some(photo.id),
          createdAt: sent.createdAt,
        })
        assertEquals(
          run,
          buildRun({
            id: run.id,
            chatId: chat.id,
            userMessage: new Message({
              ...buildUserMessage({
                id: userMessage.id,
                chatId: chat.id,
                text: 'Plan a weekend in Lisbon',
                createdAt: sentAt,
              }),
              attachments: [record],
            }),
            provenance: replyProvenance,
            createdAt: run.createdAt,
          }),
        )
        assertEquals(yield* selectMessages(chat.id), [
          new Message({ ...userMessage, attachments: [record], run: Option.some(run) }),
        ])
        assertEquals(yield* selectAttachments([photo.id]), [photo])
        assertEquals(
          yield* selectChat(chat.id),
          Option.some(
            new Chat({
              ...chat,
              title: Option.some(ChatTitle.make('Trip')),
              attachments: [record],
              run: Option.some(run),
            }),
          ),
        )
      }).pipe(Effect.provide(Layer.provide(ChatTest, jobs.layer)))
    },
  )

  it.effect(
    "the first create queues the reply job with the process's provenance and the title job, a later one the reply only",
    () => {
      const jobs = recordMessages()
      return Effect.gen(function* () {
        const createUserMessage = yield* CreateUserMessageUseCase

        const first = yield* createUserMessage.create(
          owner,
          chat.id,
          ask('Plan a weekend in Lisbon'),
        )
        yield* settle(first)
        const second = yield* createUserMessage.create(owner, chat.id, ask('And in Porto?'))

        assertEquals(yield* jobs.sent, [
          replyJob(first.id),
          {
            queue: 'chat-title',
            message: new GenerateChatTitle({ chatId: chat.id, messageId: first.userMessageId }),
          },
          replyJob(second.id),
        ])
      }).pipe(Effect.provide(Layer.provide(ChatTest, jobs.layer)))
    },
  )

  it.effect('create while a Run is in work is ChatBusyError before any message or job', () => {
    const jobs = recordMessages()
    return Effect.gen(function* () {
      const createUserMessage = yield* CreateUserMessageUseCase
      yield* createUserMessage.create(owner, chat.id, ask('Plan a weekend in Lisbon'))

      const error = yield* createUserMessage
        .create(owner, chat.id, ask('And in Porto?'))
        .pipe(Effect.flip)

      assertSchemaEquals(ChatBusyError, error, new ChatBusyError({ id: chat.id }))
      assert.lengthOf(yield* selectMessages(chat.id), 1)
      assert.lengthOf(yield* jobs.sent, 2)
    }).pipe(Effect.provide(Layer.provide(ChatTest, jobs.layer)))
  })

  it.effect(
    'create with an attachment a message of the chat holds is AttachmentBoundError before any message',
    () => {
      const jobs = recordMessages()
      return Effect.gen(function* () {
        const createUserMessage = yield* CreateUserMessageUseCase
        const photo = yield* upload(owner)
        const first = yield* createUserMessage.create(owner, chat.id, {
          text: 'Look',
          attachmentIds: [photo.id],
        })
        yield* settle(first)
        const record = yield* selectSentAttachment(chat.id)

        const error = yield* createUserMessage
          .create(owner, chat.id, { text: 'Again', attachmentIds: [record.id] })
          .pipe(Effect.flip)

        assertSchemaEquals(
          AttachmentBoundError,
          error,
          new AttachmentBoundError({ id: record.id, chatIds: [chat.id] }),
        )
        // The first send's message and its reply, and nothing of the refused one.
        assert.lengthOf(yield* selectMessages(chat.id), 2)
      }).pipe(Effect.provide(Layer.provide(ChatTest, jobs.layer)))
    },
  )

  it.effect(
    'create with an attachment of another chat is AttachmentNotFoundError before any message',
    () => {
      const jobs = recordMessages()
      return Effect.gen(function* () {
        const createUserMessage = yield* CreateUserMessageUseCase
        const other = yield* ChatService.use((chats) => chats.create(owner))
        const photo = yield* upload(owner)
        yield* createUserMessage.create(owner, chat.id, {
          text: 'Look',
          attachmentIds: [photo.id],
        })
        const record = yield* selectSentAttachment(chat.id)

        const error = yield* createUserMessage
          .create(owner, other.id, { text: 'Look', attachmentIds: [record.id] })
          .pipe(Effect.flip)

        assertSchemaEquals(
          AttachmentNotFoundError,
          error,
          new AttachmentNotFoundError({ ids: [record.id] }),
        )
        assertEquals(yield* selectMessages(other.id), [])
      }).pipe(Effect.provide(Layer.provide(ChatTest, jobs.layer)))
    },
  )

  it.effect(
    "create with another user's attachment is AttachmentNotFoundError before any message or job",
    () => {
      const jobs = recordMessages()
      return Effect.gen(function* () {
        const createUserMessage = yield* CreateUserMessageUseCase
        const photo = yield* upload(stranger)

        const error = yield* createUserMessage
          .create(owner, chat.id, { text: 'Look', attachmentIds: [photo.id] })
          .pipe(Effect.flip)

        assertSchemaEquals(
          AttachmentNotFoundError,
          error,
          new AttachmentNotFoundError({ ids: [photo.id] }),
        )
        assertEquals(yield* selectMessages(chat.id), [])
        assertEquals(yield* selectAttachments([photo.id]), [photo])
        assertEquals(yield* jobs.sent, [])
      }).pipe(Effect.provide(Layer.provide(ChatTest, jobs.layer)))
    },
  )

  it.effect(
    'create with an attachment whose bytes are gone is AttachmentNotFoundError before any message or bind',
    () => {
      const jobs = recordMessages()
      return Effect.gen(function* () {
        const files = yield* FileRepository
        const createUserMessage = yield* CreateUserMessageUseCase
        const photo = yield* upload(owner)
        yield* files.delete({ id: [photo.id] })

        const error = yield* createUserMessage
          .create(owner, chat.id, { text: 'Look', attachmentIds: [photo.id] })
          .pipe(Effect.flip)

        assertSchemaEquals(
          AttachmentNotFoundError,
          error,
          new AttachmentNotFoundError({ ids: [photo.id] }),
        )
        assertEquals(yield* selectMessages(chat.id), [])
        assertEquals(yield* selectAttachments([photo.id]), [photo])
        assertEquals(yield* jobs.sent, [])
      }).pipe(Effect.provide(Layer.provide(ChatTest, jobs.layer)))
    },
  )
})
