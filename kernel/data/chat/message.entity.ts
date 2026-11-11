import { createInsertSchema } from 'drizzle-orm/effect-schema'
import { Schema, type Types } from 'effect'
import type { RequireAtLeastOne } from 'type-fest'

import { AttachmentEntity } from '#kernel/data/attachment/attachment.entity'
import { MessageColumns, messages } from '#kernel/data/chat/message.table'

/** A message with its attachments, in upload order: every read nests them (`withAttachments`). */
export const MessageEntity = Schema.Struct({
  ...MessageColumns.fields,
  attachments: Schema.Array(AttachmentEntity),
})
export type MessageEntity = typeof MessageEntity.Type

export const MessageEntityInsert = createInsertSchema(messages)

/** `userId` is the owner of the row's chat, not a column of `messages`. */
export type MessageEntityWhere = Types.Simplify<
  RequireAtLeastOne<Pick<MessageEntity, 'id' | 'chatId'>> & Partial<{ readonly userId: string }>
>

export const inCreationOrder = { createdAt: 'asc', id: 'asc' } as const

export const withAttachments = { attachments: { orderBy: inCreationOrder } } as const
