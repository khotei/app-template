import { eq } from 'drizzle-orm'
import { Array as Arr, Effect, Layer, Option, Schema } from 'effect'
import { KeyValueStore } from 'effect/persistence'

import {
  ActiveMessageStage,
  type ChatId,
  isActiveMessage,
  Message,
  MessageId,
  MessageRepository,
} from '@app-template/domain/chat'

import { decodeMessage, MessageInsert, messages } from '#infrastructure/chat/message.entity'
import { Db, decodeFound, orDieWithSqlError } from '#infrastructure/db/db.client'
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

const encodeMessage = Schema.encodeEffect(MessageInsert)

const withAttachmentIds = {
  attachments: { columns: { id: true }, orderBy: { createdAt: 'asc', id: 'asc' } },
} as const

export const MessageRepositoryPg = Layer.effect(
  MessageRepository,
  Effect.map(Db, (db) =>
    MessageRepository.of({
      insert: Effect.fn('MessageRepository.insert')(function* (message) {
        const row = yield* encodeMessage(message)
        yield* db.insert(messages).values(row)
      }, orDieWithSqlError),
      update: Effect.fn('MessageRepository.update')(function* (message) {
        const row = yield* encodeMessage(message)
        yield* db.update(messages).set(row).where(eq(messages.id, message.id))
      }, orDieWithSqlError),
      selectById: Effect.fn('MessageRepository.selectById')(function* (id) {
        const row = yield* db.query.messages.findFirst({ where: { id }, with: withAttachmentIds })
        return yield* decodeFound(row, decodeMessage)
      }, orDieWithSqlError),
      selectByChat: Effect.fn('MessageRepository.selectByChat')(function* (chatId) {
        const rows = yield* db.query.messages.findMany({
          where: { chatId },
          orderBy: { createdAt: 'asc', id: 'asc' },
          with: withAttachmentIds,
        })
        return yield* Effect.forEach(rows, decodeMessage)
      }, orDieWithSqlError),
      selectActiveByChat: Effect.fn('MessageRepository.selectActiveByChat')(function* (chatId) {
        const row = yield* db.query.messages.findFirst({
          where: {
            chatId,
            author: 'assistant',
            stage: { in: Arr.copy(ActiveMessageStage.literals) },
          },
          with: withAttachmentIds,
        })
        const found = yield* decodeFound(row, decodeMessage)
        return Option.filter(found, isActiveMessage)
      }, orDieWithSqlError),
      deleteByChat: Effect.fn('MessageRepository.deleteByChat')(
        (chatId: ChatId) => db.delete(messages).where(eq(messages.chatId, chatId)),
        orDieWithSqlError,
      ),
    }),
  ),
)
