import { Schema, type Types } from 'effect'
import type { RequireAtLeastOne } from 'type-fest'

import { MessageColumns } from '#kernel/data/chat/message.table'
import { RunColumns } from '#kernel/data/chat/run.table'

/**
 * A message with its Run, flat: a user's the newest that answers it, an assistant's the one that
 * wrote it. Every read nests it and picks the Run with `buildMessageEntity`.
 */
export const MessageEntity = Schema.Struct({
  ...MessageColumns.fields,
  run: Schema.NullOr(RunColumns),
})
export type MessageEntity = typeof MessageEntity.Type

/** `userId` is the owner of the row's chat, not a column of `messages`. */
export type MessageEntityWhere = Types.Simplify<
  RequireAtLeastOne<Pick<MessageEntity, 'id' | 'chatId'>> & { readonly userId?: string }
>

interface MessageRead extends Omit<MessageEntity, 'run'> {
  readonly newestRun: RunColumns | null
  readonly replyOf: RunColumns | null
}

export const buildMessageEntity = ({
  newestRun,
  replyOf,
  ...message
}: MessageRead): MessageEntity => ({
  ...message,
  run: { user: newestRun, assistant: replyOf }[message.author],
})
