import { createInsertSchema, createSelectSchema } from 'drizzle-orm/effect-schema'
import { Schema, type Types } from 'effect'
import type { RequireAtLeastOne } from 'type-fest'

import { AttachmentEntity } from '#kernel/data/attachment/attachment.entity'
import { MessageFailureJson, messages } from '#kernel/data/chat/message.table'

const refine = { error: () => MessageFailureJson }

/** A message with its attachments, in upload order: every read nests them (`withAttachments`). */
export const MessageEntity = Schema.Struct({
  ...createSelectSchema(messages, refine).fields,
  attachments: Schema.Array(AttachmentEntity),
})

export const MessageEntityInsert = createInsertSchema(messages, refine)

/** `userId` is the owner of the row's chat, not a column of `messages`. */
export type MessageEntityWhere = Types.Simplify<
  RequireAtLeastOne<Pick<typeof MessageEntity.Type, 'id' | 'chatId'>> &
    Partial<{
      readonly userId: string
      readonly status: ReadonlyArray<(typeof MessageEntity.Type)['status']>
    }>
>

export type MessageEntitySet = Types.Simplify<
  RequireAtLeastOne<Pick<typeof MessageEntity.Type, 'status' | 'text' | 'error' | 'updatedAt'>>
>

export const inCreationOrder = { createdAt: 'asc', id: 'asc' } as const

export const withAttachments = { attachments: { orderBy: inCreationOrder } } as const
