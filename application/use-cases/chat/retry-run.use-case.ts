import { Effect } from 'effect'

import {
  AskChatService,
  type ChatId,
  ChatService,
  JobRunService,
} from '@app-template/application/chat'
import type { UserId } from '@app-template/application/identity'

/** Stores a new queued Run of the failed newest Run's message, then sends its job. */
export const retryRun = Effect.fn('retryRun')(function* (userId: UserId, chatId: ChatId) {
  const chats = yield* ChatService
  const asks = yield* AskChatService
  const jobs = yield* JobRunService

  const chat = yield* chats.getOne({ id: chatId, userId })
  const run = yield* asks.retry(chat)
  return yield* jobs.send(run)
})
