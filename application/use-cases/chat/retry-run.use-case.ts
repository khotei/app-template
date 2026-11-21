import { Effect } from 'effect'

import { AskChatService, type ChatId, ChatService } from '@app-template/application/chat'
import type { UserId } from '@app-template/application/identity'

/** Retries the failed newest Run of the user's chat, returning the new Run. */
export const retryRun = Effect.fn('retryRun')(function* (userId: UserId, chatId: ChatId) {
  const chats = yield* ChatService
  const asks = yield* AskChatService

  const chat = yield* chats.getOne({ id: chatId, userId })
  return yield* asks.retry(chat)
})
