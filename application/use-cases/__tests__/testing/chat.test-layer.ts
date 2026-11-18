import { BunCrypto } from '@effect/platform-bun'
import { Layer } from 'effect'

import { chat, insertChatLayer } from '@app-template/application/chat/testing'
import {
  AttachmentRepository,
  ChatRepository,
  MessageRepository,
  RunRepository,
} from '@app-template/kernel/data'
import {
  FileObjects,
  FileRepositoryTest,
  RepositoryStackTest,
} from '@app-template/kernel/data/testing'
import { TransactionTest } from '@app-template/packages/db/testing'

import { CreateUserMessageUseCase } from '#use-cases/chat/create-user-message.use-case'
import { GenerateAssistantMessageUseCase } from '#use-cases/chat/generate-assistant-message.use-case'
import { RetryRunUseCase } from '#use-cases/chat/retry-run.use-case'

/**
 * The reply use case over the memory layers, on fresh rows where `chat` exists, the attachments'
 * bytes in memory and the identity transaction; the `Assistant` is the test's, `recordAssistant()`.
 */
export const AssistantMessageTest = GenerateAssistantMessageUseCase.layer.pipe(
  Layer.provideMerge(insertChatLayer(chat)),
  Layer.provideMerge(Layer.merge(RepositoryStackTest, TransactionTest)),
  Layer.provide(BunCrypto.layer),
)

/** What each repository answers in a case, as `Layer.mock` takes it; a method left out dies. */
export interface ChatRepositoryMocks {
  readonly chats?: Layer.PartialEffectful<ChatRepository['Service']>
  readonly messages?: Layer.PartialEffectful<MessageRepository['Service']>
  readonly runs?: Layer.PartialEffectful<RunRepository['Service']>
  readonly attachments?: Layer.PartialEffectful<AttachmentRepository['Service']>
}

const mockRepositories = ({
  chats = {},
  messages = {},
  runs = {},
  attachments = {},
}: ChatRepositoryMocks) =>
  Layer.mergeAll(
    Layer.mock(ChatRepository, chats),
    Layer.mock(MessageRepository, messages),
    Layer.mock(RunRepository, runs),
    Layer.mock(AttachmentRepository, attachments),
  )

/**
 * The send and retry use cases over `mocks`, the memory files and the identity transaction; the
 * files stay in context, and the `QueueSender` is the test's, `recordMessages()`.
 */
export const layerChatTest = (mocks: ChatRepositoryMocks) =>
  Layer.mergeAll(CreateUserMessageUseCase.layer, RetryRunUseCase.layer).pipe(
    Layer.provide([mockRepositories(mocks), TransactionTest, BunCrypto.layer]),
    Layer.provideMerge(FileRepositoryTest),
    Layer.provideMerge(FileObjects.layer),
  )
