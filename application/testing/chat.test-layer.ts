import { BunCrypto } from '@effect/platform-bun'
import { Array as Arr, identity, Layer } from 'effect'

import {
  type Attachment,
  AttachmentRepository,
  AttachmentService,
} from '@app-template/domain/attachment'
import { ChatService } from '@app-template/domain/chat'
import {
  AttachmentBucketTest,
  chat,
  insertChatLayer,
  queuedChat,
  RepositoryStackTest,
} from '@app-template/domain/testing'
import { AttachmentBucketS3, AttachmentRepositoryPg } from '@app-template/infrastructure/attachment'
import { ChatPg } from '@app-template/infrastructure/chat'
import { Transaction } from '@app-template/infrastructure/db'
import { QueueClientOutbox } from '@app-template/infrastructure/shared'
import { AwsTest, TransactionTest } from '@app-template/infrastructure/testing'
import { QueueClient } from '@app-template/queue'

import { GenerateAssistantMessageUseCase } from '#application/chat/generate-assistant-message.use-case'
import { GenerateChatTitleUseCase } from '#application/chat/generate-chat-title.use-case'
import { SendMessageUseCase } from '#application/chat/send-message.use-case'
import { DbWithUsersTest } from '#application/testing/db.test-layer'

const ChatServices = Layer.mergeAll(
  ChatService.layer,
  AttachmentService.layer,
  SendMessageUseCase.layer,
)

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
  Layer.provideMerge(insertChatLayer(chat)),
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
  Layer.provideMerge(insertChatLayer(chat)),
  Layer.provideMerge(Layer.merge(RepositoryStackTest, AttachmentBucketTest)),
  Layer.provide(BunCrypto.layer),
)

/**
 * The reply use case over the memory layers, on fresh rows where `queuedChat` exists, the attachments'
 * bytes in memory and the identity transaction; the `Assistant` is the test's, `recordAssistant()`.
 */
export const AssistantMessageTest = GenerateAssistantMessageUseCase.layer.pipe(
  Layer.provideMerge(insertChatLayer(queuedChat)),
  Layer.provideMerge(Layer.mergeAll(RepositoryStackTest, AttachmentBucketTest, TransactionTest)),
  Layer.provide(BunCrypto.layer),
)

/**
 * The chat services and use cases on a fresh test database where `chat` exists, over the real
 * transaction, the outbox and the attachments bucket of a stage of the test's own: for what only
 * Postgres decides, a rollback.
 */
export const ChatPgTest = ChatServices.pipe(
  Layer.provideMerge(insertChatLayer(chat)),
  Layer.provideMerge(
    Layer.mergeAll(
      ChatPg,
      AttachmentRepositoryPg,
      AttachmentBucketS3,
      QueueClientOutbox,
      Transaction.layer,
    ),
  ),
  Layer.provideMerge(DbWithUsersTest),
  Layer.provide([AwsTest, BunCrypto.layer]),
)

export const selectAttachments = (attachments: ReadonlyArray<Attachment>) =>
  AttachmentRepository.use((repository) =>
    repository.selectMany({ id: Arr.map(attachments, (attachment) => attachment.id) }),
  )
