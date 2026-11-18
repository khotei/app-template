import { createInsertSchema } from 'drizzle-orm/effect-schema'
import { Schema, type Types } from 'effect'
import type { RequireAtLeastOne } from 'type-fest'

import { AttachmentEntity } from '#kernel/data/attachment/attachment.entity'
import { MessageColumns, messages } from '#kernel/data/chat/message.table'
import { newestFirst } from '#kernel/data/chat/run.entity'
import { RunColumns } from '#kernel/data/chat/run.table'

/**
 * A message with its attachments, in upload order, and its Run, flat: a user's the newest that
 * answers it, an assistant's the one that wrote it. Every read nests them (`withAttachments`,
 * `withRun`) and picks the Run with `buildMessageEntity`.
 */
export const MessageEntity = Schema.Struct({
  ...MessageColumns.fields,
  attachments: Schema.Array(AttachmentEntity),
  run: Schema.NullOr(RunColumns),
})
export type MessageEntity = typeof MessageEntity.Type

export const MessageEntityInsert = createInsertSchema(messages)

/** `userId` is the owner of the row's chat, not a column of `messages`. */
export type MessageEntityWhere = Types.Simplify<
  RequireAtLeastOne<Pick<MessageEntity, 'id' | 'chatId'>> &
    Partial<Pick<MessageEntity, 'author'> & { readonly userId: string }>
>

export const inCreationOrder = { createdAt: 'asc', id: 'asc' } as const

export const withAttachments = { attachments: { orderBy: inCreationOrder } } as const

/** The two relations a read fills; `buildMessageEntity` keeps the one the author has. */
export const withRun = { latestRun: { orderBy: newestFirst }, replyOf: true } as const

interface MessageRead extends Omit<MessageEntity, 'run'> {
  readonly latestRun: RunColumns | null
  readonly replyOf: RunColumns | null
}

export function buildMessageEntity({ latestRun, replyOf, ...message }: MessageRead): MessageEntity {
  return { ...message, run: { user: latestRun, assistant: replyOf }[message.author] }
}
