import { assert, describe, it } from '@effect/vitest'
import { assertEquals } from '@effect/vitest/utils'
import { Array as Arr, DateTime, Effect, Exit, Option, Schema } from 'effect'
import { SqlClient } from 'effect/sql'

import {
  Attachment,
  AttachmentBoundError,
  AttachmentNotFoundError,
} from '@app-template/domain/attachment'
import {
  buildAssistantMessage,
  buildUserMessage,
  Chat,
  ChatBusyError,
  type ChatId,
  ChatNotFoundError,
  type MessageId,
  type MessageInput,
} from '@app-template/domain/chat'
import {
  ask,
  chat,
  epoch,
  owner,
  stranger,
  unknownAttachmentId,
  unknownChatId,
  upload,
} from '@app-template/domain/testing'
import { assertSchemaEquals, isUuidV7, sortById } from '@app-template/testing'

import { ChatService } from '#application/chat/chat.service'
import { SendMessageUseCase } from '#application/chat/send-message.use-case'
import {
  ChatTest,
  selectAttachments,
  selectChat,
  selectMessages,
  settle,
} from '#application/testing/chat.test-layer'

const boundElsewhere = Effect.gen(function* () {
  const chats = yield* ChatService
  const sendMessage = yield* SendMessageUseCase
  const other = yield* chats.create(owner)
  const photo = yield* upload(owner)

  yield* sendMessage.send(owner, other.id, { text: '', attachmentIds: [photo.id] })
  return photo.id
})

const refusedAttachments = [
  {
    name: 'an unknown attachment',
    arrange: Effect.succeed(unknownAttachmentId),
    refusal: AttachmentNotFoundError,
  },
  {
    name: "another user's attachment",
    arrange: Effect.map(upload(stranger), (photo) => photo.id),
    refusal: AttachmentNotFoundError,
  },
  {
    name: 'an attachment bound to another message',
    arrange: boundElsewhere,
    refusal: AttachmentBoundError,
  },
] as const

const refusedWrites = [
  {
    name: 'reply insert',
    constraint: `ALTER TABLE messages ADD CONSTRAINT refuse_reply CHECK (author <> 'assistant')`,
  },
  {
    name: 'title job insert',
    constraint: `ALTER TABLE outbox ADD CONSTRAINT refuse_title CHECK (queue <> 'chat-title')`,
  },
] as const

const selectOutbox = Effect.flatMap(
  SqlClient.SqlClient,
  (sql) => sql`SELECT queue, job_id AS "jobId", body::json AS job FROM outbox`,
).pipe(Effect.orDie)

const sendConcurrently = (sends: ReadonlyArray<readonly [ChatId, MessageInput]>) =>
  Effect.flatMap(SendMessageUseCase, (sendMessage) =>
    Effect.all(
      Arr.map(sends, ([chatId, input]) => Effect.exit(sendMessage.send(owner, chatId, input))),
      { concurrency: 'unbounded' },
    ),
  )

describe('SendMessageUseCase', () => {
  it.live('send stores the user message and a queued assistant message and bumps the chat', () =>
    Effect.gen(function* () {
      const sendMessage = yield* SendMessageUseCase

      const { userMessage, assistantMessage } = yield* sendMessage.send(
        owner,
        chat.id,
        ask('Plan a weekend in Lisbon'),
      )

      const sentAt = userMessage.message.createdAt
      assert.isTrue(DateTime.isGreaterThan(sentAt, epoch))
      assert.isTrue(isUuidV7(userMessage.message.id) && isUuidV7(assistantMessage.message.id))
      assertEquals(
        [userMessage.message, assistantMessage.message],
        [
          buildUserMessage({
            id: userMessage.message.id,
            chatId: chat.id,
            text: 'Plan a weekend in Lisbon',
            createdAt: sentAt,
          }),
          buildAssistantMessage({
            id: assistantMessage.message.id,
            chatId: chat.id,
            createdAt: sentAt,
          }),
        ],
      )
      const stored = yield* selectMessages(chat.id)
      assertEquals(sortById(stored), sortById([userMessage.message, assistantMessage.message]))
      assertEquals(
        yield* selectChat(chat.id),
        Option.some(new Chat({ ...chat, updatedAt: sentAt })),
      )
      assertEquals(userMessage.attachments, [])
    }).pipe(Effect.provide(ChatTest)),
  )

  it.effect('the first send writes the reply and the title jobs, a later one the reply only', () =>
    Effect.gen(function* () {
      const sendMessage = yield* SendMessageUseCase

      const first = yield* sendMessage.send(owner, chat.id, ask('Plan a weekend in Lisbon'))
      yield* settle(first.assistantMessage.message)
      const second = yield* sendMessage.send(owner, chat.id, ask('And in Porto?'))

      const jobs = yield* selectOutbox
      const reply = (id: MessageId) => ({
        queue: 'assistant-message',
        jobId: id,
        job: { chatId: chat.id, messageId: id },
      })
      assert.sameDeepMembers(Arr.copy(jobs), [
        reply(first.assistantMessage.message.id),
        {
          queue: 'chat-title',
          jobId: chat.id,
          job: { chatId: chat.id, messageId: first.userMessage.message.id },
        },
        reply(second.assistantMessage.message.id),
      ])
    }).pipe(Effect.provide(ChatTest)),
  )

  it.effect('send while a message is active fails ChatBusyError and stores nothing', () =>
    Effect.gen(function* () {
      const sendMessage = yield* SendMessageUseCase
      const first = yield* sendMessage.send(owner, chat.id, ask('Plan a weekend in Lisbon'))

      const error = yield* Effect.flip(sendMessage.send(owner, chat.id, ask('Hello?')))

      const stored = yield* selectMessages(chat.id)
      assertSchemaEquals(ChatBusyError, error, new ChatBusyError({ id: chat.id }))
      assertEquals(
        sortById(stored),
        sortById([first.userMessage.message, first.assistantMessage.message]),
      )
      assert.strictEqual((yield* selectOutbox).length, 2)
    }).pipe(Effect.provide(ChatTest)),
  )

  it.live.each(refusedWrites)(
    'send whose $name fails leaves no message, no bind, no chat change and no job',
    ({ constraint }) =>
      Effect.gen(function* () {
        const sendMessage = yield* SendMessageUseCase
        const sql = yield* SqlClient.SqlClient
        const photo = yield* upload(owner)
        yield* Effect.orDie(sql.unsafe(constraint))

        const exit = yield* Effect.exit(
          sendMessage.send(owner, chat.id, { text: 'Look', attachmentIds: [photo.id] }),
        )

        assert.isTrue(Exit.hasDies(exit))
        assertEquals(yield* selectMessages(chat.id), [])
        assertEquals(yield* selectAttachments([photo]), [photo])
        assertEquals(yield* selectChat(chat.id), Option.some(chat))
        assert.deepStrictEqual(yield* selectOutbox, [])
      }).pipe(Effect.provide(ChatTest)),
  )

  it.effect('send binds the attachments to the user message and returns their metadata', () =>
    Effect.gen(function* () {
      const sendMessage = yield* SendMessageUseCase
      const photos = [yield* upload(owner), yield* upload(owner)]
      const attachmentIds = Arr.map(photos, (photo) => photo.id)

      const { userMessage } = yield* sendMessage.send(owner, chat.id, { text: '', attachmentIds })

      const bound = Arr.map(
        photos,
        (photo) => new Attachment({ ...photo, messageId: Option.some(userMessage.message.id) }),
      )
      assertEquals(userMessage.attachments, bound)
      assertEquals(yield* selectAttachments(photos), bound)
    }).pipe(Effect.provide(ChatTest)),
  )

  it.effect.each(refusedAttachments)(
    'send with $name fails and stores nothing',
    ({ arrange, refusal }) =>
      Effect.gen(function* () {
        const sendMessage = yield* SendMessageUseCase
        const valid = yield* upload(owner)
        const refused = yield* arrange
        const jobsBefore = (yield* selectOutbox).length

        const error = yield* Effect.flip(
          sendMessage.send(owner, chat.id, { text: 'Look', attachmentIds: [valid.id, refused] }),
        )

        assertSchemaEquals(refusal, error, new refusal({ id: refused }))
        assertEquals(yield* selectMessages(chat.id), [])
        assertEquals(yield* selectAttachments([valid]), [valid])
        assert.strictEqual((yield* selectOutbox).length, jobsBefore)
      }).pipe(Effect.provide(ChatTest)),
  )

  it.effect('two concurrent sends on one chat: one is stored, the other fails ChatBusyError', () =>
    Effect.gen(function* () {
      const exits = yield* sendConcurrently([
        [chat.id, ask('Lisbon?')],
        [chat.id, ask('Porto?')],
      ])

      assert.strictEqual(Arr.filter(exits, Exit.isSuccess).length, 1)
      assertSchemaEquals(
        Schema.Array(ChatBusyError),
        Arr.getSomes(Arr.map(exits, Exit.findErrorOption)),
        [new ChatBusyError({ id: chat.id })],
      )
      assert.strictEqual((yield* selectMessages(chat.id)).length, 2)
      assert.strictEqual((yield* selectOutbox).length, 2)
    }).pipe(Effect.provide(ChatTest)),
  )

  it.effect('two concurrent sends in two chats with one attachment: only one binds it', () =>
    Effect.gen(function* () {
      const chats = yield* ChatService
      const other = yield* chats.create(owner)
      const photo = yield* upload(owner)
      const input = { text: 'Look', attachmentIds: [photo.id] }

      const exits = yield* sendConcurrently([
        [chat.id, input],
        [other.id, input],
      ])

      const successes = Arr.getSomes(Arr.map(exits, Exit.getSuccess))
      assert.strictEqual(successes.length, 1)
      assertSchemaEquals(
        Schema.Array(AttachmentBoundError),
        Arr.getSomes(Arr.map(exits, Exit.findErrorOption)),
        [new AttachmentBoundError({ id: photo.id })],
      )
      assertEquals(
        yield* selectAttachments([photo]),
        Arr.flatMap(successes, (sentMessages) => sentMessages.userMessage.attachments),
      )
    }).pipe(Effect.provide(ChatTest)),
  )

  it.effect("send in another user's chat or in an unknown chat is ChatNotFoundError", () =>
    Effect.gen(function* () {
      const sendMessage = yield* SendMessageUseCase

      const foreign = yield* Effect.flip(sendMessage.send(stranger, chat.id, ask('Hello')))
      const missing = yield* Effect.flip(sendMessage.send(owner, unknownChatId, ask('Hello')))

      assertSchemaEquals(ChatNotFoundError, foreign, new ChatNotFoundError({ id: chat.id }))
      assertSchemaEquals(ChatNotFoundError, missing, new ChatNotFoundError({ id: unknownChatId }))
      assertEquals(yield* selectMessages(chat.id), [])
      assert.deepStrictEqual(yield* selectOutbox, [])
    }).pipe(Effect.provide(ChatTest)),
  )
})
