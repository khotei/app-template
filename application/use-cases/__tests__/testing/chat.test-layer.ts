import { BunCrypto } from '@effect/platform-bun'
import { Layer } from 'effect'

import {
  AttachmentRepository,
  ChatRepository,
  MessageRepository,
  RunRepository,
} from '@app-template/kernel/data'
import { FileObjects, FileRepositoryTest } from '@app-template/kernel/data/testing'
import type { Transaction } from '@app-template/packages/db'
import { TransactionTest } from '@app-template/packages/db/testing'

import { CreateUserMessageUseCase } from '#use-cases/chat/create-user-message.use-case'
import { GenerateAssistantMessageUseCase } from '#use-cases/chat/generate-assistant-message.use-case'
import { RetryRunUseCase } from '#use-cases/chat/retry-run.use-case'

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
 * The send and retry use cases over `mocks`, the memory files and `transaction`, the identity one
 * by default; the files stay in context, and the `QueueSender` is the test's, `recordMessages()`.
 */
export const layerChatTest = (
  mocks: ChatRepositoryMocks,
  transaction: Layer.Layer<Transaction> = TransactionTest,
) =>
  Layer.mergeAll(CreateUserMessageUseCase.layer, RetryRunUseCase.layer).pipe(
    Layer.provide([mockRepositories(mocks), transaction, BunCrypto.layer]),
    Layer.provideMerge(FileRepositoryTest),
    Layer.provideMerge(FileObjects.layer),
  )

/**
 * The reply use case over `mocks`, the memory files and the identity transaction; the files stay
 * in context, and the `Assistant` is the test's, `recordAssistant()`.
 */
export const layerAssistantMessageTest = (mocks: ChatRepositoryMocks) =>
  GenerateAssistantMessageUseCase.layer.pipe(
    Layer.provide([mockRepositories(mocks), TransactionTest, BunCrypto.layer]),
    Layer.provideMerge(FileRepositoryTest),
    Layer.provideMerge(FileObjects.layer),
  )
