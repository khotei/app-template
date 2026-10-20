import { Array as Arr, Effect, Layer, Option } from 'effect'
import { KeyValueStore } from 'effect/persistence'

import {
  type ChatId,
  isActiveMessage,
  Message,
  MessageId,
  MessageRepository,
} from '@app-template/domain/chat'

import { createCollection, createIndex } from '#infrastructure/kv/kv-collection'

const chatMessagesKey = (chatId: ChatId) => `${chatId}/messages`

export const MessageRepositoryKv = Layer.effect(
  MessageRepository,
  Effect.map(KeyValueStore.KeyValueStore, (store) => {
    const messages = createCollection(store, { prefix: 'messages/', schema: Message })
    const chatMessages = createIndex(store, { prefix: 'chats/', id: MessageId })
    return MessageRepository.of({
      insert: Effect.fn('MessageRepository.insert')(function* (message) {
        yield* messages.set(message.id, message)
        yield* chatMessages.append(chatMessagesKey(message.chatId), message.id)
      }),
      update: Effect.fn('MessageRepository.update')((message: Message) =>
        messages.update(message.id, () => message),
      ),
      selectById: Effect.fn('MessageRepository.selectById')(messages.get),
      selectByChat: Effect.fn('MessageRepository.selectByChat')((chatId: ChatId) =>
        Effect.flatMap(chatMessages.list(chatMessagesKey(chatId)), messages.getMany),
      ),
      // Only the last message can be active: a send is refused while one is.
      selectActiveByChat: Effect.fn('MessageRepository.selectActiveByChat')(function* (chatId) {
        const ids = yield* chatMessages.list(chatMessagesKey(chatId))
        const last = Arr.last(ids)
        if (Option.isNone(last)) return Option.none()

        const stored = yield* messages.get(last.value)
        return Option.filter(stored, isActiveMessage)
      }),
      // The index goes last, so a retry after a crash still finds the messages it lists.
      deleteByChat: Effect.fn('MessageRepository.deleteByChat')(function* (chatId) {
        const ids = yield* chatMessages.list(chatMessagesKey(chatId))
        yield* Effect.forEach(ids, (id) => messages.delete(id), { discard: true })
        yield* chatMessages.delete(chatMessagesKey(chatId))
      }),
    })
  }),
)
