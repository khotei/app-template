import { ConfigProvider, Layer } from 'effect'

import { ChatRepository, MessageRepository, RunRepository } from '@app-template/kernel/data'
import { QueueSender } from '@app-template/packages/aws/queue'
import type { Transaction } from '@app-template/packages/db'
import { layerTransactionAround, TransactionTest } from '@app-template/packages/db/testing'

import { ChatQueue } from '#chat/infrastructure/chat.queue'
import { ChatAssistant } from '#chat/infrastructure/chat-assistant.llm'
import { AskChatService } from '#chat/services/ask-chat.service'
import { ChatService } from '#chat/services/chat.service'
import { ContextChatService } from '#chat/services/context-chat.service'
import { MessageService } from '#chat/services/message.service'
import { ReplyChatService } from '#chat/services/reply-chat.service'
import { RunService } from '#chat/services/run.service'
import { TitleChatService } from '#chat/services/title-chat.service'

/**
 * For a case that reads what a transaction holds: a service's test reaches the package's test
 * support through this file.
 */
export { layerTransactionAround }

/** What each repository returns in a case, as `Layer.mock` takes it; a method left out dies. */
export interface ChatRepositoryMocks {
  readonly chats?: Layer.PartialEffectful<ChatRepository['Service']>
  readonly messages?: Layer.PartialEffectful<MessageRepository['Service']>
  readonly runs?: Layer.PartialEffectful<RunRepository['Service']>
}

/**
 * The leaves the services take in their `make`, each a case's double: `recordMessages()`,
 * `recordChatAssistant()`; one a case leaves out dies on its first call.
 */
export interface ChatLeaves {
  readonly queue?: Layer.Layer<QueueSender>
  readonly assistant?: Layer.Layer<ChatAssistant>
  readonly transaction?: Layer.Layer<Transaction>
  /** The setting's value: none of a case's contexts reaches it unless the case sets it. */
  readonly chatContextTokensLimit?: number
}

/**
 * Chat's services over `mocks` and `leaves`, the transaction the identity one by default, each in
 * context for the case.
 */
export const layerChatTest = (
  { chats = {}, messages = {}, runs = {} }: ChatRepositoryMocks,
  {
    queue = Layer.mock(QueueSender, {}),
    assistant = Layer.mock(ChatAssistant, {}),
    transaction = TransactionTest,
    chatContextTokensLimit = 1_000_000,
  }: ChatLeaves = {},
) =>
  Layer.mergeAll(
    AskChatService.layer,
    ChatQueue.layer,
    ReplyChatService.layer,
    TitleChatService.layer,
    ChatService.layer,
    ContextChatService.layer,
    MessageService.layer,
    RunService.layer,
  ).pipe(
    Layer.provideMerge(
      Layer.mergeAll(
        Layer.mock(ChatRepository, chats),
        Layer.mock(MessageRepository, messages),
        Layer.mock(RunRepository, runs),
        queue,
        assistant,
        transaction,
      ),
    ),
    Layer.provide(
      ConfigProvider.layer(
        ConfigProvider.fromUnknown({ LLM_CHAT_CONTEXT_TOKENS_LIMIT: chatContextTokensLimit }),
      ),
    ),
  )
