import { Effect } from 'effect'

import { type ChatId, ChatService, FileAttachmentService } from '@app-template/application/chat'
import type { UserId } from '@app-template/application/identity'

/**
 * Removes the user's chat with its messages and attachments, then the bytes of its uploads;
 * another user's chat is `ChatNotFoundError`.
 */
export const deleteChat = Effect.fn('deleteChat')(function* (userId: UserId, chatId: ChatId) {
  const chats = yield* ChatService
  const fileAttachments = yield* FileAttachmentService

  // The bytes once the rows are gone, since the object store joins no transaction.
  const chat = yield* chats.delete({ id: chatId, userId })
  yield* fileAttachments.deleteBytes(chat.attachments)
})
