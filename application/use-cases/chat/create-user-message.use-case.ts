import { Effect } from 'effect'

import {
  type ChatId,
  ChatService,
  ensureChatNotBusy,
  ensureMessageInput,
  isNewChat,
  MessageService,
  RunService,
} from '@app-template/application/chat'
import type { UserId } from '@app-template/application/identity'
import { Transaction } from '@app-template/packages/db'

import { sendGenerateAssistantMessage, sendGenerateChatTitle } from '#use-cases/chat/chat.sender'

/** The message and its Run commit together: a Run that loses the race keeps no message. */
const storeUserMessage = Effect.fnUntraced(
  function* (chatId: ChatId, text: string) {
    const messages = yield* MessageService
    const runs = yield* RunService

    const message = yield* messages.create({ chatId, text, author: 'user' })
    return yield* runs.create(message)
  },
  (writes) => Transaction.use((transaction) => transaction.run(writes)),
)

/** Stores the user's message and the queued Run that answers it, then sends its jobs. */
export const createUserMessage = Effect.fn('createUserMessage')(function* (
  userId: UserId,
  chatId: ChatId,
  text: string,
) {
  const chats = yield* ChatService

  yield* ensureMessageInput(text)
  const chat = yield* chats.getOne({ id: chatId, userId })
  yield* ensureChatNotBusy(chat.run)

  const run = yield* storeUserMessage(chatId, text)

  // Neither send fails the create, so the jobs go in either order.
  if (isNewChat(chat)) yield* sendGenerateChatTitle(run.userMessage)
  return yield* sendGenerateAssistantMessage(run)
})
