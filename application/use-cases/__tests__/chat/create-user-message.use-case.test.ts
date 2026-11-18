import { assert, describe, it } from '@effect/vitest'
import { assertEquals } from '@effect/vitest/utils'
import { Array as Arr, DateTime, Effect, Layer, Option, Schema, Stream } from 'effect'

import {
  Attachment,
  AttachmentBoundError,
  AttachmentId,
  AttachmentNotFoundError,
  buildAttachment,
  buildRun,
  buildUserMessage,
  Chat,
  ChatBusyError,
  ChatTitle,
  chatTitleQueue,
  FileName,
  FileSize,
  GenerateAssistantMessage,
  GenerateChatTitle,
  MediaType,
  MessageFields,
  type MessageInput,
  Run,
  RunFields,
  type RunId,
} from '@app-template/application/chat'
import {
  chat,
  firstMessage,
  owner,
  queuedRun,
  unknownChatId,
} from '@app-template/application/chat/testing'
import {
  type AttachmentEntity,
  FileRepository,
  type MessageColumns,
  type RunColumns,
} from '@app-template/kernel/data'
import { decodeRowWith, encodeRowWith } from '@app-template/packages/db'
import { QueueError, QueueSender } from '@app-template/packages/queue'
import { recordMessages } from '@app-template/packages/queue/testing'
import {
  assertSchemaEquals,
  epoch,
  isUuidV7,
  png,
  recordLogs,
} from '@app-template/packages/testing'

import { type ChatRepositoryMocks, layerChatTest } from '#testing/use-cases/chat.test-layer'
import { CreateUserMessageUseCase } from '#use-cases/chat/create-user-message.use-case'

const ask = (text: string): MessageInput => ({ text, attachmentIds: [] })

/** An unbound attachment of `owner` in the library. */
const photo = buildAttachment({
  id: AttachmentId.make('0192d4e0-7b3a-7c00-8000-000000000024'),
  userId: owner,
  fileName: FileName.make('photo.png'),
  mediaType: MediaType.make('image/png'),
  size: FileSize.make(png.length),
  createdAt: epoch,
})

/** `chat`'s record of `photo`, sent with `firstMessage`. */
const record = new Attachment({
  ...photo,
  id: AttachmentId.make('0192d4e0-7b3a-7c00-8000-000000000025'),
  messageId: Option.some(firstMessage.id),
  chatId: Option.some(chat.id),
  sourceId: Option.some(photo.id),
})

/** Stores `photo`'s bytes, as its upload left them. */
const storePhotoBytes = FileRepository.use((files) =>
  files.insert({ ...photo, content: Stream.make(png) }),
)

/** The reads of `read`, the chat the send names, and of `attachments`, those it asks for. */
const sendingTo = (read: Chat, ...attachments: ReadonlyArray<Attachment>) =>
  ({
    chats: { selectOne: () => encodeRowWith(Chat)(read).pipe(Effect.map(Option.some)) },
    attachments: {
      selectMany: () => Effect.forEach(attachments, (each) => encodeRowWith(Attachment)(each)),
    },
  }) satisfies ChatRepositoryMocks

/** The rows a send hands each repository's `insert`. */
interface Inserts {
  readonly messages: Array<MessageColumns>
  readonly attachments: Array<AttachmentEntity>
  readonly runs: Array<RunColumns>
}

/** `mocks` whose inserts keep each row they are handed in `inserts`. */
const insertingInto = (
  inserts: Inserts,
  mocks: ReturnType<typeof sendingTo>,
): ChatRepositoryMocks => ({
  ...mocks,
  messages: {
    insert: (row) =>
      Effect.sync(() => {
        inserts.messages.push(row)
      }),
  },
  attachments: {
    ...mocks.attachments,
    insert: (row) =>
      Effect.sync(() => {
        inserts.attachments.push(row)
      }),
  },
  runs: {
    insert: (row) =>
      Effect.sync(() => {
        inserts.runs.push(row)
      }),
  },
})

const noInserts = (): Inserts => ({ messages: [], attachments: [], runs: [] })

const replyJob = (runId: RunId) => ({
  queue: 'assistant-message',
  message: new GenerateAssistantMessage({ runId }),
})

const titledChat = new Chat({ ...chat, title: Option.some(ChatTitle.make('Trip')) })

const answeredChat = new Chat({
  ...chat,
  run: Option.some(new Run({ ...queuedRun, status: 'done' })),
})

const busyChat = new Chat({ ...chat, run: Option.some(queuedRun) })

describe('CreateUserMessageUseCase', () => {
  it.live(
    'create inserts the user message, a record of its library attachment and its queued Run, writing no chat',
    () => {
      const jobs = recordMessages()
      const inserts = noInserts()
      return Effect.gen(function* () {
        const createUserMessage = yield* CreateUserMessageUseCase
        yield* storePhotoBytes

        const run = yield* createUserMessage.create(owner, chat.id, {
          text: 'Plan a weekend in Lisbon',
          attachmentIds: [photo.id],
        })

        const { userMessage } = run
        const sentAt = userMessage.createdAt
        assert.isTrue(DateTime.isGreaterThan(sentAt, epoch))
        assert.isTrue(DateTime.isGreaterThanOrEqualTo(run.createdAt, sentAt))
        assert.isTrue(isUuidV7(userMessage.id) && isUuidV7(run.id))
        assertEquals(
          run,
          buildRun({
            id: run.id,
            chatId: chat.id,
            userMessage: buildUserMessage({
              id: userMessage.id,
              chatId: chat.id,
              text: 'Plan a weekend in Lisbon',
              createdAt: sentAt,
            }),
            createdAt: run.createdAt,
          }),
        )
        assert.deepStrictEqual(inserts.messages, [yield* encodeRowWith(MessageFields)(userMessage)])
        assert.deepStrictEqual(inserts.runs, [yield* encodeRowWith(RunFields)(run)])
        const sent = yield* decodeRowWith(Schema.Array(Attachment))(inserts.attachments)
        assert.isTrue(
          Arr.every(
            sent,
            (each) => isUuidV7(each.id) && DateTime.isGreaterThan(each.createdAt, epoch),
          ),
        )
        assertEquals(
          sent,
          Arr.map(
            sent,
            (each) =>
              new Attachment({
                ...record,
                id: each.id,
                messageId: Option.some(userMessage.id),
                createdAt: each.createdAt,
              }),
          ),
        )
        assert.lengthOf(sent, 1)
      }).pipe(
        Effect.provide(
          layerChatTest(insertingInto(inserts, sendingTo(titledChat, photo))).pipe(
            Layer.provide(jobs.layer),
          ),
        ),
      )
    },
  )

  it.effect.each([
    { name: 'the first create queues the reply job and the title job', read: chat, title: true },
    {
      name: 'a create after an answered one queues the reply job only',
      read: answeredChat,
      title: false,
    },
  ])('$name', ({ read, title }) => {
    const jobs = recordMessages()
    return Effect.gen(function* () {
      const createUserMessage = yield* CreateUserMessageUseCase

      const run = yield* createUserMessage.create(owner, chat.id, ask('Plan a weekend in Lisbon'))

      const titleJob = {
        queue: 'chat-title',
        message: new GenerateChatTitle({ messageId: run.userMessageId }),
      }
      assertEquals(yield* jobs.sent, title ? [replyJob(run.id), titleJob] : [replyJob(run.id)])
    }).pipe(
      Effect.provide(
        layerChatTest(insertingInto(noInserts(), sendingTo(read))).pipe(Layer.provide(jobs.layer)),
      ),
    )
  })

  it.effect('a title job SQS refuses is logged with its chat and message', () => {
    const { logs, layer: logger } = recordLogs('chatId', 'messageId')
    const RefusingTitleQueueTest = Layer.mock(QueueSender, {
      send: ({ name }) =>
        name === chatTitleQueue.name
          ? Effect.fail(new QueueError({ cause: new Error('SQS is unavailable') }))
          : Effect.void,
    })
    return Effect.gen(function* () {
      const createUserMessage = yield* CreateUserMessageUseCase

      const run = yield* createUserMessage.create(owner, chat.id, ask('Plan a weekend in Lisbon'))

      assert.deepStrictEqual(logs, [['Error', 'chat title not queued', chat.id, run.userMessageId]])
    }).pipe(
      Effect.provide([
        layerChatTest(insertingInto(noInserts(), sendingTo(chat))).pipe(
          Layer.provide(RefusingTitleQueueTest),
        ),
        logger,
      ]),
    )
  })

  it.effect('create while a Run is in work is ChatBusyError before any write or job', () => {
    const jobs = recordMessages()
    return Effect.gen(function* () {
      const createUserMessage = yield* CreateUserMessageUseCase

      const error = yield* createUserMessage
        .create(owner, chat.id, ask('And in Porto?'))
        .pipe(Effect.flip)

      assertSchemaEquals(ChatBusyError, error, new ChatBusyError({ id: chat.id }))
      assertEquals(yield* jobs.sent, [])
    }).pipe(Effect.provide(layerChatTest(sendingTo(busyChat)).pipe(Layer.provide(jobs.layer))))
  })

  it.effect(
    'create with an attachment a message of the chat holds is AttachmentBoundError before any write',
    () => {
      const jobs = recordMessages()
      return Effect.gen(function* () {
        const createUserMessage = yield* CreateUserMessageUseCase
        yield* storePhotoBytes

        const error = yield* createUserMessage
          .create(owner, chat.id, { text: 'Again', attachmentIds: [record.id] })
          .pipe(Effect.flip)

        assertSchemaEquals(
          AttachmentBoundError,
          error,
          new AttachmentBoundError({ id: record.id, chatIds: [chat.id] }),
        )
      }).pipe(
        Effect.provide(layerChatTest(sendingTo(chat, record)).pipe(Layer.provide(jobs.layer))),
      )
    },
  )

  it.effect.each([
    {
      name: 'held by another chat',
      ids: Arr.make(record.id),
      found: [new Attachment({ ...record, chatId: Option.some(unknownChatId) })],
      bytes: true,
    },
    {
      name: 'the store finds none of, as for another user',
      ids: Arr.make(photo.id),
      found: [],
      bytes: true,
    },
    { name: 'whose bytes are gone', ids: Arr.make(photo.id), found: [photo], bytes: false },
  ])(
    'create with an attachment $name is AttachmentNotFoundError before any write or job',
    ({ ids, found, bytes }) => {
      const jobs = recordMessages()
      return Effect.gen(function* () {
        const createUserMessage = yield* CreateUserMessageUseCase
        if (bytes) yield* storePhotoBytes

        const error = yield* createUserMessage
          .create(owner, chat.id, { text: 'Look', attachmentIds: ids })
          .pipe(Effect.flip)

        assertSchemaEquals(AttachmentNotFoundError, error, new AttachmentNotFoundError({ ids }))
        assertEquals(yield* jobs.sent, [])
      }).pipe(
        Effect.provide(layerChatTest(sendingTo(chat, ...found)).pipe(Layer.provide(jobs.layer))),
      )
    },
  )
})
