import { BunCrypto } from '@effect/platform-bun'
import { Array as Arr, Layer } from 'effect'

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
import { CurrentReplyProvenanceTest, TransactionTest } from '@app-template/infrastructure/testing'

import { GenerateAssistantMessageUseCase } from '#application/chat/generate-assistant-message.use-case'
import { GenerateChatTitleUseCase } from '#application/chat/generate-chat-title.use-case'
import { SendMessageUseCase } from '#application/chat/send-message.use-case'

/** The chat services and the message use case, for a test to put over its stores. */
export const ChatServices = Layer.mergeAll(
  ChatService.layer,
  AttachmentService.layer,
  SendMessageUseCase.layer,
).pipe(Layer.provide(CurrentReplyProvenanceTest))

/**
 * The chat services and use cases over the memory layers, on fresh rows where `chat` exists, the
 * identity transaction; the `QueueSender` is the test's, `recordQueue()`.
 */
export const ChatTest = ChatServices.pipe(
  Layer.provideMerge(insertChatLayer(chat)),
  Layer.provideMerge(Layer.mergeAll(RepositoryStackTest, AttachmentBucketTest, TransactionTest)),
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

export const selectAttachments = (attachments: ReadonlyArray<Attachment>) =>
  AttachmentRepository.use((repository) =>
    repository.selectMany({ id: Arr.map(attachments, (attachment) => attachment.id) }),
  )
