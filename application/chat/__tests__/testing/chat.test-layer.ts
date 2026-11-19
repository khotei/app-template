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

import { AttachmentService } from '#chat/services/attachment.service'
import { ChatService } from '#chat/services/chat.service'
import { MessageService } from '#chat/services/message.service'
import { RunService } from '#chat/services/run.service'

/** What each repository answers in a case, as `Layer.mock` takes it; a method left out dies. */
export interface ChatRepositoryMocks {
  readonly chats?: Layer.PartialEffectful<ChatRepository['Service']>
  readonly messages?: Layer.PartialEffectful<MessageRepository['Service']>
  readonly runs?: Layer.PartialEffectful<RunRepository['Service']>
  readonly attachments?: Layer.PartialEffectful<AttachmentRepository['Service']>
}

/**
 * Chat's services over `mocks`, the memory files and `transaction`, the identity one by default,
 * each in context for the case; the `QueueSender` and the `Assistant` are the test's,
 * `recordMessages()` and `recordAssistant()`.
 */
export const layerChatTest = (
  { chats = {}, messages = {}, runs = {}, attachments = {} }: ChatRepositoryMocks,
  transaction: Layer.Layer<Transaction> = TransactionTest,
) =>
  Layer.mergeAll(
    AttachmentService.layer,
    ChatService.layer,
    MessageService.layer,
    RunService.layer,
  ).pipe(
    Layer.provideMerge(
      Layer.mergeAll(
        Layer.mock(ChatRepository, chats),
        Layer.mock(MessageRepository, messages),
        Layer.mock(RunRepository, runs),
        Layer.mock(AttachmentRepository, attachments),
        transaction,
        BunCrypto.layer,
      ),
    ),
    Layer.provideMerge(FileRepositoryTest),
    Layer.provideMerge(FileObjects.layer),
  )
