import { BunCrypto } from '@effect/platform-bun'
import { assert, describe, it } from '@effect/vitest'
import { assertEquals } from '@effect/vitest/utils'
import { Array as Arr, DateTime, Effect, Exit, Layer, Option, Record as Rec, Schema } from 'effect'
import { KeyValueStore } from 'effect/persistence'
import { TestClock, TestCrypto } from 'effect/testing'

import {
  Attachment,
  AttachmentBoundError,
  AttachmentId,
  AttachmentNotFoundError,
  AttachmentRepository,
  AttachmentStore,
  FileName,
  MediaType,
} from '@app-template/domain/attachment'
import {
  buildAssistantMessage,
  buildChat,
  buildUserMessage,
  Chat,
  ChatBusyError,
  ChatId,
  ChatNotFoundError,
  ChatRepository,
  ChatTitle,
  completeMessage,
  type Message,
  MessageId,
  type MessageInput,
  MessageInputInvalidError,
  MessageNotFoundError,
  MessageRepository,
  prepareMessage,
} from '@app-template/domain/chat'
import { UserId } from '@app-template/domain/user'
import { AttachmentRepositoryKv, AttachmentStoreKv } from '@app-template/infrastructure/attachment'
import {
  ChatRepositoryKv,
  GenerateAssistantMessage,
  GenerateChatTitle,
  MessageRepositoryKv,
} from '@app-template/infrastructure/chat'
import { QueueClient } from '@app-template/queue'

import { AttachmentService } from '#application/attachment/attachment.service'
import { ChatService } from '#application/chat/chat.service'

interface SentJob {
  readonly queue: string
  readonly jobId: string
  readonly job: unknown
}

/**
 * A write that runs once, on the next `selectActiveByChat` of any caller. Armed right before the
 * `send` under test, it lands after that send's active-message check and before its writes.
 */
interface Interleaving {
  write: Effect.Effect<void>
}

const makeHarness = () => {
  const sent: Array<SentJob> = []
  const interleaving: Interleaving = { write: Effect.void }
  const queue = Layer.effect(
    QueueClient,
    Effect.map(QueueClient, (inner) =>
      QueueClient.of({
        ...inner,
        send: (definition, job) =>
          Effect.andThen(
            Effect.sync(() =>
              sent.push({ queue: definition.name, jobId: definition.jobId(job), job }),
            ),
            inner.send(definition, job),
          ),
      }),
    ),
  ).pipe(Layer.provide(QueueClient.layerMemory))
  const takeInterleaving = Effect.suspend(() => {
    const { write } = interleaving
    interleaving.write = Effect.void
    return write
  })
  // The memory store never yields, so a fiber would finish its send before the next one starts;
  // yielding after each check lets two concurrent sends interleave between check and write.
  const messages = Layer.effect(
    MessageRepository,
    Effect.map(MessageRepository, (inner) =>
      MessageRepository.of({
        ...inner,
        selectActiveByChat: (chatId) =>
          Effect.tap(inner.selectActiveByChat(chatId), () =>
            Effect.andThen(Effect.yieldNow, takeInterleaving),
          ),
      }),
    ),
  ).pipe(Layer.provide(MessageRepositoryKv))
  const attachments = Layer.effect(
    AttachmentRepository,
    Effect.map(AttachmentRepository, (inner) =>
      AttachmentRepository.of({
        ...inner,
        selectById: (id) => Effect.tap(inner.selectById(id), Effect.yieldNow),
      }),
    ),
  ).pipe(Layer.provide(AttachmentRepositoryKv))
  const layer = Layer.mergeAll(ChatService.layer, AttachmentService.layer).pipe(
    Layer.provideMerge(Layer.mergeAll(ChatRepositoryKv, messages, attachments, AttachmentStoreKv)),
    Layer.provide(queue),
    Layer.provide(TestCrypto.layer('chat-service').pipe(Layer.provide(BunCrypto.layer))),
    Layer.provide(KeyValueStore.layerMemory),
  )
  return { sent, interleaving, layer }
}

type HarnessServices = Layer.Success<ReturnType<typeof makeHarness>['layer']>

interface Arranged {
  readonly service: ChatService['Service']
  readonly chat: Chat
  readonly sent: ReadonlyArray<SentJob>
  readonly interleaving: Interleaving
}

const owner = UserId.make('0192d4e0-7b3a-7c00-8000-000000000010')
const stranger = UserId.make('0192d4e0-7b3a-7c00-8000-000000000011')
const sentAt = DateTime.makeUnsafe('2026-10-18T12:00:00.000Z')
const unknownAttachmentId = AttachmentId.make('0192d4e0-7b3a-7c00-8000-000000000029')
const unknownChatId = ChatId.make('0192d4e0-7b3a-7c00-8000-000000000038')
const unknownMessageId = MessageId.make('0192d4e0-7b3a-7c00-8000-000000000039')

/** Runs `body` on a fresh harness, with a chat of `owner` created at the clock's start. */
const withChat = <E>(body: (arranged: Arranged) => Effect.Effect<void, E, HarnessServices>) => {
  const { sent, interleaving, layer } = makeHarness()
  return Effect.gen(function* () {
    const service = yield* ChatService
    const chat = yield* service.create(owner)
    yield* body({ service, chat, sent, interleaving })
  }).pipe(Effect.provide(layer))
}

const isUuidV7 = Schema.is(Schema.String.check(Schema.isUUID(7)))

const selectChat = (chatId: ChatId) =>
  Effect.flatMap(ChatRepository, (chats) => chats.selectById(chatId))

const selectMessages = (chatId: ChatId) =>
  Effect.flatMap(MessageRepository, (messages) => messages.selectByChat(chatId))

const settle = (message: Message) =>
  Effect.gen(function* () {
    const prepared = yield* prepareMessage(message, yield* DateTime.now)
    const completed = yield* completeMessage(prepared, 'Sure.', yield* DateTime.now)
    yield* (yield* MessageRepository).update(completed)
  })

const ask = (text: string): MessageInput => ({ text, attachmentIds: [] })

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

const upload = (userId: UserId, name: string) =>
  Effect.flatMap(AttachmentService, (attachments) =>
    attachments.upload(userId, {
      fileName: FileName.make(name),
      mediaType: MediaType.make('image/png'),
      bytes: png,
    }),
  )

const idsOf = (attachments: ReadonlyArray<Attachment>) =>
  Arr.map(attachments, (attachment) => attachment.id)

const selectAttachments = (attachments: ReadonlyArray<Attachment>) =>
  Effect.flatMap(AttachmentRepository, (repository) => repository.selectByIds(idsOf(attachments)))

const boundElsewhere = Effect.gen(function* () {
  const service = yield* ChatService
  const other = yield* service.create(owner)
  const photo = yield* upload(owner, 'bound.png')
  yield* service.send(owner, other.id, { text: '', attachmentIds: [photo.id] })
  return photo.id
})

const refusedAttachments = {
  'an unknown attachment': {
    arrange: Effect.succeed(unknownAttachmentId),
    refusal: (id: AttachmentId) => new AttachmentNotFoundError({ id }),
  },
  "another user's attachment": {
    arrange: Effect.map(upload(stranger, 'foreign.png'), (photo) => photo.id),
    refusal: (id: AttachmentId) => new AttachmentNotFoundError({ id }),
  },
  'an attachment bound to another message': {
    arrange: boundElsewhere,
    refusal: (id: AttachmentId) => new AttachmentBoundError({ id }),
  },
} as const

type ChatCall = (
  service: ChatService['Service'],
  userId: UserId,
  chatId: ChatId,
) => Effect.Effect<unknown, unknown>

const chatCalls = {
  get: (service, userId, chatId) => service.get(userId, chatId),
  rename: (service, userId, chatId) => service.rename(userId, chatId, ChatTitle.make('Trip')),
  delete: (service, userId, chatId) => service.delete(userId, chatId),
  send: (service, userId, chatId) => service.send(userId, chatId, ask('Hello')),
  getMessage: (service, userId, chatId) => service.getMessage(userId, chatId, unknownMessageId),
} as const satisfies Record<string, ChatCall>

const sendConcurrently = (
  service: ChatService['Service'],
  sends: ReadonlyArray<readonly [ChatId, MessageInput]>,
) =>
  Effect.all(
    Arr.map(sends, ([chatId, input]) => Effect.exit(service.send(owner, chatId, input))),
    { concurrency: 'unbounded' },
  )

describe('ChatService', () => {
  it.effect('create stores an untitled chat with a UUIDv7 id at the clock time', () => {
    const { layer } = makeHarness()
    return Effect.gen(function* () {
      const service = yield* ChatService
      yield* TestClock.setTime(DateTime.toEpochMillis(sentAt))

      const chat = yield* service.create(owner)

      assert.isTrue(isUuidV7(chat.id))
      assertEquals(chat, buildChat({ id: chat.id, userId: owner, createdAt: sentAt }))
      assertEquals(yield* service.list(owner), [{ chat, activeMessage: Option.none() }])
    }).pipe(Effect.provide(layer))
  })

  it.effect('send stores the user message and a queued assistant message and bumps the chat', () =>
    withChat(({ service, chat }) =>
      Effect.gen(function* () {
        yield* TestClock.setTime(DateTime.toEpochMillis(sentAt))

        const { userMessage, assistantMessage } = yield* service.send(
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
    withChat(({ service, chat, interleaving }) =>
      Effect.gen(function* () {
        const titled = new Chat({ ...chat, title: Option.some(ChatTitle.make('Lisbon weekend')) })
        interleaving.write = (yield* ChatRepository).update(titled)
        yield* TestClock.setTime(DateTime.toEpochMillis(sentAt))

        yield* service.send(owner, chat.id, ask('Plan a weekend in Lisbon'))

        assertEquals(
          yield* selectChat(chat.id),
          Option.some(new Chat({ ...titled, updatedAt: sentAt })),
        )
      }),
    ),
  )

  it.effect('the first send enqueues the reply and the title, a later one the reply only', () =>
    withChat(({ service, chat, sent }) =>
      Effect.gen(function* () {
        const first = yield* service.send(owner, chat.id, ask('Plan a weekend in Lisbon'))
        yield* settle(first.assistantMessage.message)
        const second = yield* service.send(owner, chat.id, ask('And in Porto?'))

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
    withChat(({ service, chat, sent }) =>
      Effect.gen(function* () {
        const first = yield* service.send(owner, chat.id, ask('Plan a weekend in Lisbon'))

        const error = yield* Effect.flip(service.send(owner, chat.id, ask('Hello?')))

        assertEquals(error, new ChatBusyError({ id: chat.id }))
        assertEquals(yield* selectMessages(chat.id), [
          first.userMessage.message,
          first.assistantMessage.message,
        ])
        assert.strictEqual(sent.length, 2)
      }),
    ),
  )

  it.effect('send binds the attachments to the user message and returns their metadata', () =>
    withChat(({ service, chat }) =>
      Effect.gen(function* () {
        const photos = [yield* upload(owner, 'a.png'), yield* upload(owner, 'b.png')]
        const attachmentIds = idsOf(photos)

        const { userMessage } = yield* service.send(owner, chat.id, { text: '', attachmentIds })

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
    return withChat(({ service, chat, sent }) =>
      Effect.gen(function* () {
        const valid = yield* upload(owner, 'valid.png')
        const refused = yield* arrange
        const jobsBefore = sent.length

        const error = yield* Effect.flip(
          service.send(owner, chat.id, { text: 'Look', attachmentIds: [valid.id, refused] }),
        )

        assertEquals(error, refusal(refused))
        assertEquals(yield* selectMessages(chat.id), [])
        assertEquals(yield* selectAttachments([valid]), [valid])
        assert.strictEqual(sent.length, jobsBefore)
      }),
    )
  })

  it.effect('send with an attachment id given twice fails MessageInputInvalidError', () =>
    withChat(({ service, chat }) =>
      Effect.gen(function* () {
        const photo = yield* upload(owner, 'twice.png')

        const error = yield* Effect.flip(
          service.send(owner, chat.id, { text: 'Look', attachmentIds: [photo.id, photo.id] }),
        )

        assertEquals(error, new MessageInputInvalidError())
        assertEquals(yield* selectMessages(chat.id), [])
        assertEquals(yield* selectAttachments([photo]), [photo])
      }),
    ),
  )

  it.effect('two concurrent sends on one chat: one is stored, the other fails ChatBusyError', () =>
    withChat(({ service, chat, sent }) =>
      Effect.gen(function* () {
        const exits = yield* sendConcurrently(service, [
          [chat.id, ask('Lisbon?')],
          [chat.id, ask('Porto?')],
        ])

        assert.strictEqual(Arr.filter(exits, Exit.isSuccess).length, 1)
        assertEquals(Arr.getSomes(Arr.map(exits, Exit.findErrorOption)), [
          new ChatBusyError({ id: chat.id }),
        ])
        assert.strictEqual((yield* selectMessages(chat.id)).length, 2)
        assert.strictEqual(sent.length, 2)
      }),
    ),
  )

  it.effect('two concurrent sends in two chats with one attachment: only one binds it', () =>
    withChat(({ service, chat }) =>
      Effect.gen(function* () {
        const other = yield* service.create(owner)
        const photo = yield* upload(owner, 'shared.png')
        const input = { text: 'Look', attachmentIds: [photo.id] }

        const exits = yield* sendConcurrently(service, [
          [chat.id, input],
          [other.id, input],
        ])

        const successes = Arr.getSomes(Arr.map(exits, Exit.getSuccess))
        assert.strictEqual(successes.length, 1)
        assertEquals(Arr.getSomes(Arr.map(exits, Exit.findErrorOption)), [
          new AttachmentBoundError({ id: photo.id }),
        ])
        assertEquals(
          yield* selectAttachments([photo]),
          Arr.flatMap(successes, (sentMessages) => sentMessages.userMessage.attachments),
        )
      }),
    ),
  )

  it.effect("list puts the last sent chat first with its active message, and only the user's", () =>
    withChat(({ service, chat: untouched }) =>
      Effect.gen(function* () {
        const sentTo = yield* service.create(owner)
        yield* service.create(stranger)
        yield* TestClock.adjust('1 second')

        const { assistantMessage } = yield* service.send(owner, sentTo.id, ask('Lisbon?'))

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
    withChat(({ service, chat }) =>
      Effect.gen(function* () {
        const photo = yield* upload(owner, 'photo.png')
        const first = yield* service.send(owner, chat.id, {
          text: 'Look',
          attachmentIds: [photo.id],
        })
        yield* settle(first.assistantMessage.message)
        const second = yield* service.send(owner, chat.id, ask('And now?'))

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
    withChat(({ service, chat }) =>
      Effect.gen(function* () {
        const photo = yield* upload(owner, 'photo.png')
        const { userMessage } = yield* service.send(owner, chat.id, {
          text: 'Look',
          attachmentIds: [photo.id],
        })

        assertEquals(yield* service.getMessage(owner, chat.id, userMessage.message.id), userMessage)
      }),
    ),
  )

  it.effect("getMessage in another user's chat is ChatNotFoundError", () =>
    withChat(({ service, chat }) =>
      Effect.gen(function* () {
        const { userMessage } = yield* service.send(owner, chat.id, ask('Lisbon?'))

        const error = yield* Effect.flip(
          service.getMessage(stranger, chat.id, userMessage.message.id),
        )

        assertEquals(error, new ChatNotFoundError({ id: chat.id }))
      }),
    ),
  )

  it.effect('getMessage of an unknown id or of another chat is MessageNotFoundError', () =>
    withChat(({ service, chat }) =>
      Effect.gen(function* () {
        const other = yield* service.create(owner)
        const { userMessage } = yield* service.send(owner, other.id, ask('Lisbon?'))

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
    withChat(({ service, chat }) =>
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

  it.effect('delete while a message is active removes the chat, its messages and attachments', () =>
    withChat(({ service, chat }) =>
      Effect.gen(function* () {
        const photo = yield* upload(owner, 'photo.png')
        yield* service.send(owner, chat.id, { text: 'Look', attachmentIds: [photo.id] })

        yield* service.delete(owner, chat.id)

        assertEquals(
          yield* Effect.flip(service.get(owner, chat.id)),
          new ChatNotFoundError({ id: chat.id }),
        )
        assertEquals(yield* service.list(owner), [])
        assertEquals(yield* selectMessages(chat.id), [])
        assertEquals(yield* selectAttachments([photo]), [])
        assertEquals(yield* (yield* AttachmentStore).select(photo.id), Option.none())
      }),
    ),
  )

  it.effect.each(Rec.keys(chatCalls))(
    "%s of another user's chat or of an unknown chat is ChatNotFoundError",
    (method) =>
      withChat(({ service, chat }) =>
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
