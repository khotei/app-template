import { Effect } from 'effect'

import {
  AskChatService,
  AskRunService,
  type ChatId,
  ChatService,
} from '@app-template/application/chat'
import type { UserId } from '@app-template/application/identity'

/** Stores a new queued Run of the failed newest Run's message, then sends its job. */
export const retryRun = Effect.fn('retryRun')(function* (userId: UserId, chatId: ChatId) {
  const chats = yield* ChatService
  const askChat = yield* AskChatService
  const askRun = yield* AskRunService

  const chat = yield* chats.getOne({ id: chatId, userId })
  const run = yield* askChat.retry(chat)
  return yield* askRun.ask(run)
})
