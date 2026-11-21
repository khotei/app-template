import { Effect } from 'effect'

import { AskChatService, type ChatId, ChatService } from '@app-template/application/chat'
import type { UserId } from '@app-template/application/identity'

/** Asks the user's chat to reply to `text`, returning the Run that answers it. */
export const createUserMessage = Effect.fn('createUserMessage')(function* (
  userId: UserId,
  chatId: ChatId,
  text: string,
) {
  const chats = yield* ChatService
  const askChat = yield* AskChatService

  const chat = yield* chats.getOne({ id: chatId, userId })
  return yield* askChat.askMessage(chat, text)
})
