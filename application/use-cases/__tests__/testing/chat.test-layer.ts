import { BunCrypto } from '@effect/platform-bun'
import { Layer } from 'effect'

import { ChatService, FileAttachmentService } from '@app-template/application/chat'
import {
  CurrentReplyProvenanceTest,
  chat,
  insertChatLayer,
  queuedChat,
} from '@app-template/application/chat/testing'
import { RepositoryStackTest } from '@app-template/kernel/data/testing'
import { TransactionTest } from '@app-template/packages/db/testing'

import { GenerateAssistantMessageUseCase } from '#use-cases/chat/generate-assistant-message.use-case'
import { GenerateChatTitleUseCase } from '#use-cases/chat/generate-chat-title.use-case'
import { SendMessageUseCase } from '#use-cases/chat/send-message.use-case'

/**
 * The chat services and use cases over the memory layers, on fresh rows where `chat` exists, the
 * identity transaction; the `QueueSender` is the test's, `recordQueue()`.
 */
export const ChatTest = Layer.mergeAll(
  ChatService.layer,
  FileAttachmentService.layer,
  SendMessageUseCase.layer,
).pipe(
  Layer.provide(CurrentReplyProvenanceTest),
  Layer.provideMerge(insertChatLayer(chat)),
  Layer.provideMerge(Layer.merge(RepositoryStackTest, TransactionTest)),
  Layer.provide(BunCrypto.layer),
)

/**
 * The title use case over the memory layers, on fresh rows where `chat` exists; the `Assistant`
 * is the test's, `recordAssistant()`.
 */
export const ChatTitleTest = GenerateChatTitleUseCase.layer.pipe(
  Layer.provideMerge(insertChatLayer(chat)),
  Layer.provideMerge(RepositoryStackTest),
  Layer.provide(BunCrypto.layer),
)

/**
 * The reply use case over the memory layers, on fresh rows where `queuedChat` exists, the attachments'
 * bytes in memory and the identity transaction; the `Assistant` is the test's, `recordAssistant()`.
 */
export const AssistantMessageTest = GenerateAssistantMessageUseCase.layer.pipe(
  Layer.provideMerge(insertChatLayer(queuedChat)),
  Layer.provideMerge(Layer.merge(RepositoryStackTest, TransactionTest)),
  Layer.provide(BunCrypto.layer),
)
