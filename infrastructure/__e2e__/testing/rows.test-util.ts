import { Schema } from 'effect'

import type { Chat, Message } from '@app-template/domain/chat'
import type { UserId } from '@app-template/domain/user'

import { ChatInsert, chats } from '#infrastructure/chat/chat.entity'
import { MessageInsert, messages } from '#infrastructure/chat/message.entity'
import { Db } from '#infrastructure/db/db.client'
import { users } from '#infrastructure/user/user.entity'

export const insertUser = (id: UserId) =>
  Db.use((db) => db.insert(users).values({ id, createdAt: new Date(0) }))

export const insertChat = (chat: Chat) =>
  Db.use((db) => db.insert(chats).values(Schema.encodeSync(ChatInsert)(chat)))

export const insertMessage = (message: Message) =>
  Db.use((db) => db.insert(messages).values(Schema.encodeSync(MessageInsert)(message)))
