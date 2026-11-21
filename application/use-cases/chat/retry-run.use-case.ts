import { Effect } from 'effect'

import { AskChatService, type ChatId, ChatService } from '@app-template/application/chat'
import type { UserId } from '@app-template/application/identity'

/** Asks the user's chat again for the reply its failed newest Run lost, returning the new Run. */
export const retryRun = Effect.fn('retryRun')(function* (userId: UserId, chatId: ChatId) {
  const chats = yield* ChatService
  const askChat = yield* AskChatService

  const chat = yield* chats.getOne({ id: chatId, userId })
  return yield* askChat.askRetryMessage(chat)
})
