import { type DateTime, Effect, Option } from 'effect'

import { Chat, type ChatId, type ChatRepository } from '@app-template/domain/chat'

/**
 * Moves the chat's `updatedAt` to `at`, keeping every other field as stored.
 *
 * It re-reads the chat right before the write instead of taking one read earlier, so a rename or
 * a title written since then survives; a deleted chat is left deleted.
 */
export const touchChat = Effect.fnUntraced(function* (
  chats: ChatRepository['Service'],
  { chatId, at }: { readonly chatId: ChatId; readonly at: DateTime.Utc },
): Effect.fn.Return<void, never, never> {
  const chat = yield* chats.selectById(chatId)
  if (Option.isNone(chat)) return
  yield* chats.update(new Chat({ ...chat.value, updatedAt: at }))
})
