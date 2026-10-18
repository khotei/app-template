import { Effect, Layer, Option } from 'effect'
import { KeyValueStore } from 'effect/persistence'

import { Chat, ChatId, ChatRepository } from '@app-template/domain/chat'
import type { UserId } from '@app-template/domain/user'

import { createCollection, createIndex } from '#infrastructure/kv/kv-collection'

const userChatsKey = (userId: UserId) => `${userId}/chats`

export const ChatRepositoryKv = Layer.effect(
  ChatRepository,
  Effect.map(KeyValueStore.KeyValueStore, (store) => {
    const chats = createCollection(store, { prefix: 'chats/', schema: Chat })
    const userChats = createIndex(store, { prefix: 'users/', id: ChatId })
    return ChatRepository.of({
      insert: Effect.fn('ChatRepository.insert')(function* (chat) {
        yield* chats.set(chat.id, chat)
        yield* userChats.append(userChatsKey(chat.userId), chat.id)
      }),
      update: Effect.fn('ChatRepository.update')(function* (chat) {
        yield* chats.update(chat.id, () => chat)
      }),
      selectById: Effect.fn('ChatRepository.selectById')(function* (id) {
        return yield* chats.get(id)
      }),
      selectByUser: Effect.fn('ChatRepository.selectByUser')(function* (userId) {
        return yield* chats.getMany(yield* userChats.list(userChatsKey(userId)))
      }),
      // The row goes last, so a retry after a crash still finds the owner whose index lists it.
      delete: Effect.fn('ChatRepository.delete')(function* (id) {
        const chat = yield* chats.get(id)
        if (Option.isNone(chat)) return
        yield* userChats.remove(userChatsKey(chat.value.userId), id)
        yield* chats.delete(id)
      }),
    })
  }),
)
