import { defineRelations } from 'drizzle-orm'

import { attachments } from '#kernel/data/attachment/attachment.table'
import { chats } from '#kernel/data/chat/chat.table'
import { messages } from '#kernel/data/chat/message.table'
import { credentials, users } from '#kernel/data/user/user.table'

export const relations = defineRelations(
  { users, credentials, chats, messages, attachments },
  (r) => ({
    users: {
      chats: r.many.chats({ from: r.users.id, to: r.chats.userId }),
      credentials: r.many.credentials({ from: r.users.id, to: r.credentials.userId }),
    },
    chats: {
      messages: r.many.messages({ from: r.chats.id, to: r.messages.chatId }),
      attachments: r.many.attachments({ from: r.chats.id, to: r.attachments.chatId }),
    },
    messages: {
      chat: r.one.chats({ from: r.messages.chatId, to: r.chats.id }),
      attachments: r.many.attachments({ from: r.messages.id, to: r.attachments.messageId }),
    },
  }),
)
