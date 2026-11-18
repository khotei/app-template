import { Effect } from 'effect'

import {
  type ChatId,
  ChatService,
  ensureChatNotBusy,
  ensureRunRetryable,
  type MessageId,
  MessageService,
  RunService,
} from '@app-template/application/chat'
import type { UserId } from '@app-template/application/identity'

import { sendGenerateAssistantMessage } from '#use-cases/chat/chat.sender'

/** Stores a new queued Run of the user's message after its failed one, then sends its job. */
export const retryRun = Effect.fn('retryRun')(function* (
  userId: UserId,
  chatId: ChatId,
  userMessageId: MessageId,
) {
  const chats = yield* ChatService
  const messages = yield* MessageService
  const runs = yield* RunService

  const userMessage = yield* messages.getOne({ id: userMessageId, chatId, userId, author: 'user' })
  yield* chats.getOne({ id: chatId, userId }).pipe(
    Effect.tap(ensureChatNotBusy),
    Effect.tap((chat) => ensureRunRetryable(chat.run, userMessage.id)),
  )

  const run = yield* runs.create(userMessage)
  yield* sendGenerateAssistantMessage(run)
  return run
})
