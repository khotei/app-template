import { createInsertSchema, createSelectSchema } from 'drizzle-orm/effect-schema'
import type { Types } from 'effect'
import type { RequireAtLeastOne } from 'type-fest'

import { attachments } from '#kernel/data/attachment/attachment.table'

export const AttachmentEntity = createSelectSchema(attachments)

export type AttachmentEntity = typeof AttachmentEntity.Type

export const AttachmentEntityInsert = createInsertSchema(attachments)

/** `messageId: null` finds the unbound. */
export type AttachmentEntityWhere = Types.Simplify<
  { readonly id: string | ReadonlyArray<string> } & Partial<
    Pick<AttachmentEntity, 'userId' | 'messageId'>
  >
>

/** A read may leave the ids out and take a user's rows; `chatId: null` finds those of no chat. */
export type AttachmentEntitySelectWhere = Types.Simplify<
  RequireAtLeastOne<Pick<AttachmentEntityWhere, 'id' | 'userId'>> &
    Partial<Pick<AttachmentEntity, 'messageId' | 'chatId'>>
>

export type AttachmentEntitySet = Types.Simplify<
  RequireAtLeastOne<Pick<AttachmentEntity, 'messageId' | 'chatId'>>
>
