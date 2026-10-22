import { assert, describe, it } from '@effect/vitest'
import { assertEquals } from '@effect/vitest/utils'
import { Array as Arr, DateTime, Effect, Exit, Option, Record as Rec, Schema } from 'effect'
import { TestClock } from 'effect/testing'

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
  MessageInputInvalidError,
} from '@app-template/domain/chat'
import { GenerateAssistantMessage, GenerateChatTitle } from '@app-template/infrastructure/chat'
import { assertSchemaEquals, isUuidV7 } from '@app-template/testing'

import { unknownAttachmentId } from '#application/testing/attachment.fixture'
import { ask, sentAt, unknownChatId } from '#application/testing/chat.fixture'
import {
  type ChatArranged,
  idsOf,
  selectAttachments,
  selectChat,
  selectMessages,
  settle,
  upload,
  withChat,
} from '#application/testing/chat.harness'
import { owner, stranger } from '#application/testing/user.fixture'

const boundElsewhere = ({ chats, sendMessage }: ChatArranged) =>
  Effect.gen(function* () {
    const other = yield* chats.create(owner)
    const photo = yield* upload(owner, 'bound.png')
    yield* sendMessage.send(owner, other.id, { text: '', attachmentIds: [photo.id] })
    return photo.id
  })

const refusedAttachments = {
  'an unknown attachment': {
    arrange: (_: ChatArranged) => Effect.succeed(unknownAttachmentId),
    refusal: AttachmentNotFoundError,
  },
  "another user's attachment": {
    arrange: (_: ChatArranged) => Effect.map(upload(stranger, 'foreign.png'), (photo) => photo.id),
    refusal: AttachmentNotFoundError,
  },
  'an attachment bound to another message': {
    arrange: boundElsewhere,
    refusal: AttachmentBoundError,
  },
} as const

const sendConcurrently = (
  { sendMessage }: ChatArranged,
  sends: ReadonlyArray<readonly [ChatId, MessageInput]>,
) =>
  Effect.all(
    Arr.map(sends, ([chatId, input]) => Effect.exit(sendMessage.send(owner, chatId, input))),
    { concurrency: 'unbounded' },
  )

describe('SendMessageUseCase', () => {
  it.effect('send stores the user message and a queued assistant message and bumps the chat', () =>
    withChat(({ chat, sendMessage }) =>
      Effect.gen(function* () {
        yield* TestClock.setTime(DateTime.toEpochMillis(sentAt))

        const { userMessage, assistantMessage } = yield* sendMessage.send(
          owner,
          chat.id,
          ask('Plan a weekend in Lisbon'),
        )

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
        assertEquals(yield* selectMessages(chat.id), [
          userMessage.message,
          assistantMessage.message,
        ])
        assertEquals(
          yield* selectChat(chat.id),
          Option.some(new Chat({ ...chat, updatedAt: sentAt })),
        )
        assertEquals(userMessage.attachments, [])
      }),
    ),
  )

  it.effect('send keeps a title set between its read of the chat and its write', () =>
    withChat(({ chat, interleaving, sendMessage }) =>
      Effect.gen(function* () {
        const titled = new Chat({ ...chat, title: Option.some(ChatTitle.make('Lisbon weekend')) })
        interleaving.write = (yield* ChatRepository).update(titled)
        yield* TestClock.setTime(DateTime.toEpochMillis(sentAt))

        yield* sendMessage.send(owner, chat.id, ask('Plan a weekend in Lisbon'))

        assertEquals(
          yield* selectChat(chat.id),
          Option.some(new Chat({ ...titled, updatedAt: sentAt })),
        )
      }),
    ),
  )

  it.effect('the first send enqueues the reply and the title, a later one the reply only', () =>
    withChat(({ chat, sent, sendMessage }) =>
      Effect.gen(function* () {
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
            job: new GenerateChatTitle({
              chatId: chat.id,
              messageId: first.userMessage.message.id,
            }),
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
      }),
    ),
  )

  it.effect('send while a message is active fails ChatBusyError and stores nothing', () =>
    withChat(({ chat, sent, sendMessage }) =>
      Effect.gen(function* () {
        const first = yield* sendMessage.send(owner, chat.id, ask('Plan a weekend in Lisbon'))

        const error = yield* Effect.flip(sendMessage.send(owner, chat.id, ask('Hello?')))

        assertSchemaEquals(ChatBusyError, error, new ChatBusyError({ id: chat.id }))
        assertEquals(yield* selectMessages(chat.id), [
          first.userMessage.message,
          first.assistantMessage.message,
        ])
        assert.strictEqual(sent.length, 2)
      }),
    ),
  )

  it.effect('send binds the attachments to the user message and returns their metadata', () =>
    withChat(({ chat, sendMessage }) =>
      Effect.gen(function* () {
        const photos = [yield* upload(owner, 'a.png'), yield* upload(owner, 'b.png')]
        const attachmentIds = idsOf(photos)

        const { userMessage } = yield* sendMessage.send(owner, chat.id, { text: '', attachmentIds })

        const bound = Arr.map(
          photos,
          (photo) => new Attachment({ ...photo, messageId: Option.some(userMessage.message.id) }),
        )
        assertEquals(userMessage.message.attachmentIds, attachmentIds)
        assertEquals(userMessage.attachments, bound)
        assertEquals(yield* selectAttachments(photos), bound)
      }),
    ),
  )

  it.effect.each(Rec.keys(refusedAttachments))('send with %s fails and stores nothing', (name) => {
    const { arrange, refusal } = refusedAttachments[name]
    return withChat((arranged) =>
      Effect.gen(function* () {
        const { chat, sent, sendMessage } = arranged
        const valid = yield* upload(owner, 'valid.png')
        const refused = yield* arrange(arranged)
        const jobsBefore = sent.length

        const error = yield* Effect.flip(
          sendMessage.send(owner, chat.id, { text: 'Look', attachmentIds: [valid.id, refused] }),
        )

        assertSchemaEquals(refusal, error, new refusal({ id: refused }))
        assertEquals(yield* selectMessages(chat.id), [])
        assertEquals(yield* selectAttachments([valid]), [valid])
        assert.strictEqual(sent.length, jobsBefore)
      }),
    )
  })

  it.effect('send with an attachment id given twice fails MessageInputInvalidError', () =>
    withChat(({ chat, sendMessage }) =>
      Effect.gen(function* () {
        const photo = yield* upload(owner, 'twice.png')

        const error = yield* Effect.flip(
          sendMessage.send(owner, chat.id, { text: 'Look', attachmentIds: [photo.id, photo.id] }),
        )

        assertSchemaEquals(MessageInputInvalidError, error, new MessageInputInvalidError())
        assertEquals(yield* selectMessages(chat.id), [])
        assertEquals(yield* selectAttachments([photo]), [photo])
      }),
    ),
  )

  it.effect('two concurrent sends on one chat: one is stored, the other fails ChatBusyError', () =>
    withChat((arranged) =>
      Effect.gen(function* () {
        const { chat, sent } = arranged
        const exits = yield* sendConcurrently(arranged, [
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
      }),
    ),
  )

  it.effect('two concurrent sends in two chats with one attachment: only one binds it', () =>
    withChat((arranged) =>
      Effect.gen(function* () {
        const { chat, chats } = arranged
        const other = yield* chats.create(owner)
        const photo = yield* upload(owner, 'shared.png')
        const input = { text: 'Look', attachmentIds: [photo.id] }

        const exits = yield* sendConcurrently(arranged, [
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
      }),
    ),
  )

  it.effect("send in another user's chat or in an unknown chat is ChatNotFoundError", () =>
    withChat(({ chat, sent, sendMessage }) =>
      Effect.gen(function* () {
        const foreign = yield* Effect.flip(sendMessage.send(stranger, chat.id, ask('Hello')))
        const missing = yield* Effect.flip(sendMessage.send(owner, unknownChatId, ask('Hello')))

        assertSchemaEquals(ChatNotFoundError, foreign, new ChatNotFoundError({ id: chat.id }))
        assertSchemaEquals(ChatNotFoundError, missing, new ChatNotFoundError({ id: unknownChatId }))
        assertEquals(yield* selectMessages(chat.id), [])
        assert.strictEqual(sent.length, 0)
      }),
    ),
  )
})
