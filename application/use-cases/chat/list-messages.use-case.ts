import { Effect } from 'effect'

import { type ChatId, ChatService, MessageService } from '@app-template/application/chat'
import type { UserId } from '@app-template/application/identity'

/** The messages of the user's chat in creation order; another user's chat is `ChatNotFoundError`. */
export const listMessages = Effect.fn('listMessages')(function* (userId: UserId, chatId: ChatId) {
  const chats = yield* ChatService
  const messages = yield* MessageService

  yield* chats.getOne({ id: chatId, userId })
  return yield* messages.getMany({ chatId })
})
