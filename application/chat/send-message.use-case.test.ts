import { assert, describe, it } from '@effect/vitest'
import { assertEquals } from '@effect/vitest/utils'
import { Array as Arr, DateTime, Effect, Exit, Option, Schema } from 'effect'

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
  ChatRepository,
  ChatTitle,
  type MessageInput,
} from '@app-template/domain/chat'
import { GenerateAssistantMessage, GenerateChatTitle } from '@app-template/infrastructure/chat'
import { assertSchemaEquals, isUuidV7, sortById } from '@app-template/testing'

import { ChatService } from '#application/chat/chat.service'
import { SendMessageUseCase } from '#application/chat/send-message.use-case'
import { unknownAttachmentId } from '#application/testing/attachment.fixture'
import { ask, chat, epoch, unknownChatId } from '#application/testing/chat.fixture'
import {
  ChatFakes,
  ChatTest,
  selectAttachments,
  selectChat,
  selectMessages,
  settle,
  upload,
} from '#application/testing/chat.harness'
import { owner, stranger } from '#application/testing/user.fixture'

const boundElsewhere = Effect.gen(function* () {
  const chats = yield* ChatService
  const sendMessage = yield* SendMessageUseCase
  const other = yield* chats.create(owner)
  const photo = yield* upload(owner, 'bound.png')

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
    arrange: Effect.map(upload(stranger, 'foreign.png'), (photo) => photo.id),
    refusal: AttachmentNotFoundError,
  },
  {
    name: 'an attachment bound to another message',
    arrange: boundElsewhere,
    refusal: AttachmentBoundError,
  },
] as const

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
            attachmentIds: [],
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

  it.live('send keeps a title set between its read of the chat and its write', () =>
    Effect.gen(function* () {
      const sendMessage = yield* SendMessageUseCase
      const { interleaving } = yield* ChatFakes
      const titled = new Chat({ ...chat, title: Option.some(ChatTitle.make('Lisbon weekend')) })
      interleaving.write = Effect.asVoid(
        (yield* ChatRepository).update({ title: titled.title }, { id: chat.id }),
      )

      const { userMessage } = yield* sendMessage.send(
        owner,
        chat.id,
        ask('Plan a weekend in Lisbon'),
      )

      assertEquals(
        yield* selectChat(chat.id),
        Option.some(new Chat({ ...titled, updatedAt: userMessage.message.createdAt })),
      )
    }).pipe(Effect.provide(ChatTest)),
  )

  it.effect('the first send enqueues the reply and the title, a later one the reply only', () =>
    Effect.gen(function* () {
      const sendMessage = yield* SendMessageUseCase
      const { sent } = yield* ChatFakes

      const first = yield* sendMessage.send(owner, chat.id, ask('Plan a weekend in Lisbon'))
      yield* settle(first.assistantMessage.message)
      const second = yield* sendMessage.send(owner, chat.id, ask('And in Porto?'))

      assertEquals(sent, [
        {
          queue: 'assistant-message',
          jobId: first.assistantMessage.message.id,
          job: new GenerateAssistantMessage({
            chatId: chat.id,
            messageId: first.assistantMessage.message.id,
          }),
        },
        {
          queue: 'chat-title',
          jobId: chat.id,
          job: new GenerateChatTitle({ chatId: chat.id, messageId: first.userMessage.message.id }),
        },
        {
          queue: 'assistant-message',
          jobId: second.assistantMessage.message.id,
          job: new GenerateAssistantMessage({
            chatId: chat.id,
            messageId: second.assistantMessage.message.id,
          }),
        },
      ])
    }).pipe(Effect.provide(ChatTest)),
  )

  it.effect('send while a message is active fails ChatBusyError and stores nothing', () =>
    Effect.gen(function* () {
      const sendMessage = yield* SendMessageUseCase
      const { sent } = yield* ChatFakes
      const first = yield* sendMessage.send(owner, chat.id, ask('Plan a weekend in Lisbon'))

      const error = yield* Effect.flip(sendMessage.send(owner, chat.id, ask('Hello?')))

      const stored = yield* selectMessages(chat.id)
      assertSchemaEquals(ChatBusyError, error, new ChatBusyError({ id: chat.id }))
      assertEquals(
        sortById(stored),
        sortById([first.userMessage.message, first.assistantMessage.message]),
      )
      assert.strictEqual(sent.length, 2)
    }).pipe(Effect.provide(ChatTest)),
  )

  it.effect('send binds the attachments to the user message and returns their metadata', () =>
    Effect.gen(function* () {
      const sendMessage = yield* SendMessageUseCase
      const photos = [yield* upload(owner, 'a.png'), yield* upload(owner, 'b.png')]
      const attachmentIds = Arr.map(photos, (photo) => photo.id)

      const { userMessage } = yield* sendMessage.send(owner, chat.id, { text: '', attachmentIds })

      const bound = Arr.map(
        photos,
        (photo) => new Attachment({ ...photo, messageId: Option.some(userMessage.message.id) }),
      )
      assertEquals(userMessage.message.attachmentIds, attachmentIds)
      assertEquals(userMessage.attachments, bound)
      assertEquals(yield* selectAttachments(photos), bound)
    }).pipe(Effect.provide(ChatTest)),
  )

  it.effect.each(refusedAttachments)(
    'send with $name fails and stores nothing',
    ({ arrange, refusal }) =>
      Effect.gen(function* () {
        const sendMessage = yield* SendMessageUseCase
        const { sent } = yield* ChatFakes
        const valid = yield* upload(owner, 'valid.png')
        const refused = yield* arrange
        const jobsBefore = sent.length

        const error = yield* Effect.flip(
          sendMessage.send(owner, chat.id, { text: 'Look', attachmentIds: [valid.id, refused] }),
        )

        assertSchemaEquals(refusal, error, new refusal({ id: refused }))
        assertEquals(yield* selectMessages(chat.id), [])
        assertEquals(yield* selectAttachments([valid]), [valid])
        assert.strictEqual(sent.length, jobsBefore)
      }).pipe(Effect.provide(ChatTest)),
  )

  it.effect('two concurrent sends on one chat: one is stored, the other fails ChatBusyError', () =>
    Effect.gen(function* () {
      const { sent } = yield* ChatFakes

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
      assert.strictEqual(sent.length, 2)
    }).pipe(Effect.provide(ChatTest)),
  )

  it.effect('two concurrent sends in two chats with one attachment: only one binds it', () =>
    Effect.gen(function* () {
      const chats = yield* ChatService
      const other = yield* chats.create(owner)
      const photo = yield* upload(owner, 'shared.png')
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
      const { sent } = yield* ChatFakes

      const foreign = yield* Effect.flip(sendMessage.send(stranger, chat.id, ask('Hello')))
      const missing = yield* Effect.flip(sendMessage.send(owner, unknownChatId, ask('Hello')))

      assertSchemaEquals(ChatNotFoundError, foreign, new ChatNotFoundError({ id: chat.id }))
      assertSchemaEquals(ChatNotFoundError, missing, new ChatNotFoundError({ id: unknownChatId }))
      assertEquals(yield* selectMessages(chat.id), [])
      assert.strictEqual(sent.length, 0)
    }).pipe(Effect.provide(ChatTest)),
  )
})
