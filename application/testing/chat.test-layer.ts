import { BunCrypto } from '@effect/platform-bun'
import { Array as Arr, Effect, identity, Layer } from 'effect'

import {
  type Attachment,
  AttachmentRepository,
  AttachmentService,
} from '@app-template/domain/attachment'
import {
  type ChatId,
  ChatRepository,
  ChatService,
  MessageRepository,
  MessageService,
} from '@app-template/domain/chat'
import {
  AttachmentBucketTest,
  type AttachmentRows,
  ChatRepositoryTest,
  type ChatRows,
  chat,
  type MessageRows,
  RepositoryStackTest,
} from '@app-template/domain/testing'
import {
  AttachmentBucketS3,
  AttachmentRepositoryPg,
  S3BucketFromConfig,
} from '@app-template/infrastructure/attachment'
import { ChatPg } from '@app-template/infrastructure/chat'
import { Transaction } from '@app-template/infrastructure/db'
import { QueueClientOutbox } from '@app-template/infrastructure/shared'
import { AwsTest, TransactionTest } from '@app-template/infrastructure/testing'
import { QueueClient } from '@app-template/queue'

import { DeleteChatUseCase } from '#application/chat/delete-chat.use-case'
import { GenerateChatTitleUseCase } from '#application/chat/generate-chat-title.use-case'
import { SendMessageUseCase } from '#application/chat/send-message.use-case'
import { DbWithUsersTest } from '#application/testing/db.test-layer'

const ChatServices = Layer.mergeAll(
  ChatService.layer,
  MessageService.layer,
  AttachmentService.layer,
  SendMessageUseCase.layer,
  DeleteChatUseCase.layer,
)

const insertChat = Layer.effectDiscard(
  Effect.flatMap(ChatRepository, (chats) => chats.insert(chat)),
)

/** The queue client on the definitions' own names; its locks never run, since nothing consumes. */
const QueueClientTest = QueueClient.layer({
  queueName: identity,
  lockExpiration: '30 seconds',
  lockRefreshInterval: '10 seconds',
})

/**
 * The chat services and use cases over the memory layers, on fresh rows where `chat` exists, the
 * identity transaction and the queue client; the `QueueTransport` is the test's, `recordQueue()`.
 * `chats` replaces the memory chat repository the services write through, to force a race the
 * real one cannot produce on demand; the test's own reads keep the plain one.
 */
export const layerChatTest = (
  chats: Layer.Layer<
    ChatRepository,
    never,
    ChatRows | MessageRows | AttachmentRows
  > = ChatRepositoryTest,
) =>
  ChatServices.pipe(
    Layer.provide(chats),
    Layer.provideMerge(insertChat),
    Layer.provideMerge(
      Layer.mergeAll(RepositoryStackTest, AttachmentBucketTest, TransactionTest, QueueClientTest),
    ),
    Layer.provide(BunCrypto.layer),
  )

export const ChatTest = layerChatTest()

/**
 * The title use case over the memory layers, on fresh rows where `chat` exists; the `Assistant`
 * is the test's, `recordAssistant()`.
 */
export const ChatTitleTest = GenerateChatTitleUseCase.layer.pipe(
  Layer.provideMerge(insertChat),
  Layer.provideMerge(RepositoryStackTest),
  Layer.provide(BunCrypto.layer),
)

/**
 * The chat services and use cases on a fresh test database where `chat` exists, over the real
 * transaction, the outbox and the attachments bucket of a stage of the test's own: for what only
 * Postgres decides, a rollback.
 */
export const ChatPgTest = ChatServices.pipe(
  Layer.provideMerge(insertChat),
  Layer.provideMerge(
    Layer.mergeAll(
      ChatPg,
      AttachmentRepositoryPg,
      AttachmentBucketS3,
      QueueClientOutbox,
      Transaction.layer,
    ),
  ),
  Layer.provide(S3BucketFromConfig),
  Layer.provideMerge(DbWithUsersTest),
  Layer.provide([AwsTest, BunCrypto.layer]),
)

export const selectChat = (chatId: ChatId) =>
  Effect.flatMap(ChatRepository, (chats) => chats.selectOne({ id: chatId }))

export const selectMessages = (chatId: ChatId) =>
  Effect.flatMap(MessageRepository, (messages) => messages.selectByChat(chatId)).pipe(
    Effect.map(Arr.map(({ message }) => message)),
  )

export const selectAttachments = (attachments: ReadonlyArray<Attachment>) =>
  Effect.flatMap(AttachmentRepository, (repository) =>
    repository.selectMany({ id: Arr.map(attachments, (attachment) => attachment.id) }),
  )
