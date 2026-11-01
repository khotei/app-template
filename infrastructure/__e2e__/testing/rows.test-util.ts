import { pipe, Schema } from 'effect'

import type { Chat, Message } from '@app-template/chat/domain'
import type { UserId } from '@app-template/identity-contract'
import { Db } from '@app-template/kernel/data'
import {
  ChatEntityInsert,
  chats,
  MessageEntityInsert,
  messages,
} from '@app-template/kernel/data/chat'
import { users } from '@app-template/kernel/data/user'

import { ChatFromEntity, MessageFromEntity } from '#infrastructure/chat/chat.mapper'

export const insertUser = (id: UserId) =>
  Db.use((db) => db.insert(users).values({ id, createdAt: new Date(0) }))

export const insertChat = (chat: Chat) =>
  Db.use((db) =>
    db
      .insert(chats)
      .values(pipe(chat, Schema.encodeSync(ChatFromEntity), Schema.decodeSync(ChatEntityInsert))),
  )

export const insertMessage = (message: Message) =>
  Db.use((db) =>
    db
      .insert(messages)
      .values(
        pipe(message, Schema.encodeSync(MessageFromEntity), Schema.decodeSync(MessageEntityInsert)),
      ),
  )
