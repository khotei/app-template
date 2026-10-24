import { eq } from 'drizzle-orm'
import { Effect, Layer, Schema } from 'effect'

import { type ChatId, ChatRepository } from '@app-template/domain/chat'

import { ChatInsert, chats, decodeChat } from '#infrastructure/chat/chat.entity'
import { Db, decodeFound, orDieWithSqlError } from '#infrastructure/db/db.client'

const encodeChat = Schema.encodeEffect(ChatInsert)

export const ChatRepositoryPg = Layer.effect(
  ChatRepository,
  Effect.map(Db, (db) =>
    ChatRepository.of({
      insert: Effect.fn('ChatRepository.insert')(function* (chat) {
        const row = yield* encodeChat(chat)
        yield* db.insert(chats).values(row)
      }, orDieWithSqlError),
      update: Effect.fn('ChatRepository.update')(function* (chat) {
        const row = yield* encodeChat(chat)
        yield* db.update(chats).set(row).where(eq(chats.id, chat.id))
      }, orDieWithSqlError),
      selectById: Effect.fn('ChatRepository.selectById')(function* (id) {
        const row = yield* db.query.chats.findFirst({ where: { id } })
        return yield* decodeFound(row, decodeChat)
      }, orDieWithSqlError),
      selectByUser: Effect.fn('ChatRepository.selectByUser')(function* (userId) {
        const rows = yield* db.query.chats.findMany({ where: { userId } })
        return yield* Effect.forEach(rows, decodeChat)
      }, orDieWithSqlError),
      delete: Effect.fn('ChatRepository.delete')(
        (id: ChatId) => db.delete(chats).where(eq(chats.id, id)),
        orDieWithSqlError,
      ),
    }),
  ),
)
