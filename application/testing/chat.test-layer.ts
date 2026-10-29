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
} from '@app-template/domain/chat'
import { AttachmentBucketTest, chat, RepositoryStackTest } from '@app-template/domain/testing'
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
import { GenerateAssistantMessageUseCase } from '#application/chat/generate-assistant-message.use-case'
import { GenerateChatTitleUseCase } from '#application/chat/generate-chat-title.use-case'
import { SendMessageUseCase } from '#application/chat/send-message.use-case'
import { DbWithUsersTest } from '#application/testing/db.test-layer'

const ChatServices = Layer.mergeAll(
  ChatService.layer,
  AttachmentService.layer,
  SendMessageUseCase.layer,
  DeleteChatUseCase.layer,
)

const insertChat = Layer.effectDiscard(ChatRepository.use((chats) => chats.insert(chat)))

/** The queue client on the definitions' own names; its locks never run, since nothing consumes. */
export const QueueClientTest = QueueClient.layer({
  queueName: identity,
  lockExpiration: '30 seconds',
  lockRefreshInterval: '10 seconds',
})

/**
 * The chat services and use cases over the memory layers, on fresh rows where `chat` exists, the
 * identity transaction and the queue client; the `QueueTransport` is the test's, `recordQueue()`.
 */
export const ChatTest = ChatServices.pipe(
  Layer.provideMerge(insertChat),
  Layer.provideMerge(
    Layer.mergeAll(RepositoryStackTest, AttachmentBucketTest, TransactionTest, QueueClientTest),
  ),
  Layer.provide(BunCrypto.layer),
)

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
 * The reply use case over the memory layers, on fresh rows where `chat` exists, the attachments'
 * bytes in memory and the identity transaction; the `Assistant` is the test's, `recordAssistant()`.
 */
export const AssistantMessageTest = GenerateAssistantMessageUseCase.layer.pipe(
  Layer.provideMerge(insertChat),
  Layer.provideMerge(Layer.mergeAll(RepositoryStackTest, AttachmentBucketTest, TransactionTest)),
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
  ChatRepository.use((chats) => chats.selectOne({ id: chatId }))

export const selectMessages = (chatId: ChatId) =>
  MessageRepository.use((messages) => messages.selectMany({ chatId: [chatId] })).pipe(
    Effect.map(Arr.map(({ message }) => message)),
  )

export const selectAttachments = (attachments: ReadonlyArray<Attachment>) =>
  AttachmentRepository.use((repository) =>
    repository.selectMany({ id: Arr.map(attachments, (attachment) => attachment.id) }),
  )
