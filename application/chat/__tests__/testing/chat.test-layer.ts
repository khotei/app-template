import { BunCrypto } from '@effect/platform-bun'
import { Layer } from 'effect'

import { ChatRepository, MessageRepository, RunRepository } from '@app-template/kernel/data'
import type { Transaction } from '@app-template/packages/db'
import { TransactionTest } from '@app-template/packages/db/testing'

import { AskChatService } from '#chat/services/ask-chat.service'
import { ChatService } from '#chat/services/chat.service'
import { MessageService } from '#chat/services/message.service'
import { MoveRunService } from '#chat/services/move-run.service'
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
 * Chat's services over `mocks` and `transaction`, the identity one by default,
 * each in context for the case; the `QueueSender` and the assistants are the test's,
 * `recordMessages()`, `recordMessageAssistant()` and `recordChatAssistant()`.
 */
export const layerChatTest = (
  { chats = {}, messages = {}, runs = {} }: ChatRepositoryMocks,
  transaction: Layer.Layer<Transaction> = TransactionTest,
) =>
  Layer.mergeAll(AskChatService.layer, ReplyChatService.layer, TitleChatService.layer).pipe(
    Layer.provideMerge(MoveRunService.layer),
    Layer.provideMerge(Layer.mergeAll(ChatService.layer, MessageService.layer, RunService.layer)),
    Layer.provideMerge(
      Layer.mergeAll(
        Layer.mock(ChatRepository, chats),
        Layer.mock(MessageRepository, messages),
        Layer.mock(RunRepository, runs),
        transaction,
        BunCrypto.layer,
      ),
    ),
  )
