import { Effect } from 'effect'

import {
  type ChatId,
  ChatService,
  ensureChatNotBusy,
  ensureRunRetryable,
  MessageService,
  RunService,
} from '@app-template/application/chat'
import type { UserId } from '@app-template/application/identity'

import { sendGenerateAssistantMessage } from '#use-cases/chat/chat.sender'

/** Stores a new queued Run of the failed newest Run's message, then sends its job. */
export const retryRun = Effect.fn('retryRun')(function* (userId: UserId, chatId: ChatId) {
  const chats = yield* ChatService
  const messages = yield* MessageService
  const runs = yield* RunService

  const chat = yield* chats.getOne({ id: chatId, userId })
  yield* ensureChatNotBusy(chat.run)
  const failed = yield* ensureRunRetryable(chat.run)
  const userMessage = yield* messages.getOne({
    id: failed.userMessageId,
    chatId,
    userId,
    author: 'user',
  })

  return yield* runs.create(userMessage).pipe(Effect.flatMap(sendGenerateAssistantMessage))
})
