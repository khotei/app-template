import { Effect } from 'effect'

import {
  AskChatService,
  type AskChatWhere,
  ChatQueue,
  ChatService,
  ChatState,
} from '@app-template/application/chat'

/**
 * Asks the user's chat `where` names for a reply to `text`, then sends a new chat's initialization;
 * returns the message with its Run. Another user's chat is not found.
 *
 * Uninterruptible whole: a client's abort after the ask would leave a new chat with no event that
 * titles it.
 */
export const askChat = Effect.fn('askChat')(function* (where: AskChatWhere, text: string) {
  const chats = yield* ChatService
  const asks = yield* AskChatService
  const queue = yield* ChatQueue

  const chat = yield* chats.getOne({ id: where.id, userId: where.userId })
  const message = yield* asks.ask(chat, text)
  if (ChatState.isNew(chat)) yield* queue.sendChatInitialized(message)

  return message
}, Effect.uninterruptible)
