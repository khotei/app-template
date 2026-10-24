import { Effect, Schema } from 'effect'

import { Chat, Message } from '@app-template/domain/chat'
import type { UserId } from '@app-template/domain/user'

import { ChatInsert, ChatRow, chats } from '#infrastructure/chat/chat.entity'
import { MessageInsert, MessageRow, messages } from '#infrastructure/chat/message.entity'
import { Db } from '#infrastructure/db/db.client'
import { users } from '#infrastructure/user/user.entity'

export const insertUser = (id: UserId) =>
  Effect.flatMap(Db, (db) => db.insert(users).values({ id, createdAt: new Date(0) }))

export const insertChat = (chat: Chat) =>
  Effect.flatMap(Db, (db) => db.insert(chats).values(Schema.encodeSync(ChatInsert)(chat)))

export const insertMessage = (message: Message) =>
  Effect.flatMap(Db, (db) => db.insert(messages).values(Schema.encodeSync(MessageInsert)(message)))

export const decodeChat = (row: typeof ChatRow.Encoded) =>
  Effect.map(Schema.decodeEffect(ChatRow)(row), (fields) => new Chat(fields))

export const decodeMessage = (row: typeof MessageRow.Encoded) =>
  Effect.map(Schema.decodeEffect(MessageRow)(row), (fields) => new Message(fields))
