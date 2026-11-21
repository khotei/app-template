import { defineRelations } from 'drizzle-orm'

import { chats } from '#kernel/data/chat/chat.table'
import { messages } from '#kernel/data/chat/message.table'
import { runs } from '#kernel/data/chat/run.table'
import { credentials, users } from '#kernel/data/user/user.table'

export const relations = defineRelations({ users, credentials, chats, messages, runs }, (r) => ({
  users: {
    credentials: r.many.credentials({ from: r.users.id, to: r.credentials.userId }),
  },
  chats: {
    // One of many, so a read orders it: one lateral join.
    run: r.one.runs({ from: r.chats.id, to: r.runs.chatId }),
  },
  messages: {
    // A user's message: the newest of the Runs that answer it, ordered by the read.
    newestRun: r.one.runs({ from: r.messages.id, to: r.runs.userMessageId }),
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
}))
