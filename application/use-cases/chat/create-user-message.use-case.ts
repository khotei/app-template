import { Effect } from 'effect'

import {
  AskChatService,
  type ChatId,
  ChatService,
  isNewChat,
  JobRunService,
  sendGenerateChatTitle,
} from '@app-template/application/chat'
import type { UserId } from '@app-template/application/identity'

/** Stores the user's message and the queued Run that answers it, then sends its jobs. */
export const createUserMessage = Effect.fn('createUserMessage')(function* (
  userId: UserId,
  chatId: ChatId,
  text: string,
) {
  const chats = yield* ChatService
  const asks = yield* AskChatService
  const jobs = yield* JobRunService

  const chat = yield* chats.getOne({ id: chatId, userId })
  const run = yield* asks.ask(chat, text)

  // Neither send fails the create, so the jobs go in either order.
  if (isNewChat(chat)) yield* sendGenerateChatTitle(run.userMessage)
  return yield* jobs.send(run)
})
