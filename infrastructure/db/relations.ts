import { defineRelations } from 'drizzle-orm'

import { attachments } from '#infrastructure/attachment/attachment.entity'
import { chats } from '#infrastructure/chat/chat.entity'
import { messages } from '#infrastructure/chat/message.entity'
import { credentials, users } from '#infrastructure/user/user.entity'

export const relations = defineRelations(
  { users, credentials, chats, messages, attachments },
  (r) => ({
    users: { chats: r.many.chats({ from: r.users.id, to: r.chats.userId }) },
    chats: { messages: r.many.messages({ from: r.chats.id, to: r.messages.chatId }) },
    messages: {
      attachments: r.many.attachments({ from: r.messages.id, to: r.attachments.messageId }),
    },
  }),
)
