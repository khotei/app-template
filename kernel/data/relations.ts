import { defineRelations } from 'drizzle-orm'

import { attachments } from '#kernel/data/attachment/attachment.table'
import { chats } from '#kernel/data/chat/chat.table'
import { messages } from '#kernel/data/chat/message.table'
import { runs } from '#kernel/data/chat/run.table'
import { credentials, users } from '#kernel/data/user/user.table'

export const relations = defineRelations(
  { users, credentials, chats, messages, runs, attachments },
  (r) => ({
    users: {
      chats: r.many.chats({ from: r.users.id, to: r.chats.userId }),
      credentials: r.many.credentials({ from: r.users.id, to: r.credentials.userId }),
    },
    chats: {
      messages: r.many.messages({ from: r.chats.id, to: r.messages.chatId }),
      attachments: r.many.attachments({ from: r.chats.id, to: r.attachments.chatId }),
      // One of many, so a read orders it (`withRun` in `chat.entity.ts`): one lateral join.
      run: r.one.runs({ from: r.chats.id, to: r.runs.chatId }),
    },
    messages: {
      chat: r.one.chats({ from: r.messages.chatId, to: r.chats.id }),
      attachments: r.many.attachments({ from: r.messages.id, to: r.attachments.messageId }),
      // A user's message: the newest of the Runs that answer it, ordered by `withRun`.
      latestRun: r.one.runs({ from: r.messages.id, to: r.runs.userMessageId }),
      // An assistant's message: the Run that wrote it.
      replyOf: r.one.runs({ from: r.messages.id, to: r.runs.assistantMessageId }),
    },
    runs: {
      userMessage: r.one.messages({
        from: r.runs.userMessageId,
        to: r.messages.id,
        optional: false,
      }),
      assistantMessage: r.one.messages({ from: r.runs.assistantMessageId, to: r.messages.id }),
    },
  }),
)
