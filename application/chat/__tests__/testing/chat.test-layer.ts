import { Layer } from 'effect'

import { ChatRepository, MessageRepository, RunRepository } from '@app-template/kernel/data'
import type { Transaction } from '@app-template/packages/db'
import { TransactionTest } from '@app-template/packages/db/testing'
import { QueueSender } from '@app-template/packages/queue'

import { ChatAssistant } from '#chat/infrastructure/chat-assistant.llm'
import { MessageAssistant } from '#chat/infrastructure/message-assistant.llm'
import { AskChatService } from '#chat/services/ask-chat.service'
import { ChatService } from '#chat/services/chat.service'
import { MessageService } from '#chat/services/message.service'
import { ReplyChatService } from '#chat/services/reply-chat.service'
import { RunService } from '#chat/services/run.service'
import { TitleChatService } from '#chat/services/title-chat.service'

/** What each repository returns in a case, as `Layer.mock` takes it; a method left out dies. */
export interface ChatRepositoryMocks {
  readonly chats?: Layer.PartialEffectful<ChatRepository['Service']>
  readonly messages?: Layer.PartialEffectful<MessageRepository['Service']>
  readonly runs?: Layer.PartialEffectful<RunRepository['Service']>
}

/**
 * The leaves the services take in their `make`, each a case's double: `recordMessages()`,
 * `recordMessageAssistant()`, `recordChatAssistant()`; one a case leaves out dies on its first call.
 */
export interface ChatLeaves {
  readonly queue?: Layer.Layer<QueueSender>
  readonly messageAssistant?: Layer.Layer<MessageAssistant>
  readonly chatAssistant?: Layer.Layer<ChatAssistant>
  readonly transaction?: Layer.Layer<Transaction>
}

/**
 * Chat's services over `mocks` and `leaves`, the transaction the identity one by default, each in
 * context for the case.
 */
export const layerChatTest = (
  { chats = {}, messages = {}, runs = {} }: ChatRepositoryMocks,
  {
    queue = Layer.mock(QueueSender, {}),
    messageAssistant = Layer.mock(MessageAssistant, {}),
    chatAssistant = Layer.mock(ChatAssistant, {}),
    transaction = TransactionTest,
  }: ChatLeaves = {},
) =>
  Layer.mergeAll(AskChatService.layer, ReplyChatService.layer, TitleChatService.layer).pipe(
    Layer.provideMerge(Layer.mergeAll(ChatService.layer, MessageService.layer, RunService.layer)),
    Layer.provideMerge(
      Layer.mergeAll(
        Layer.mock(ChatRepository, chats),
        Layer.mock(MessageRepository, messages),
        Layer.mock(RunRepository, runs),
        queue,
        messageAssistant,
        chatAssistant,
        transaction,
      ),
    ),
  )
