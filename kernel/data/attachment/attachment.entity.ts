import { createInsertSchema, createSelectSchema } from 'drizzle-orm/effect-schema'
import type { Types } from 'effect'
import type { RequireAtLeastOne } from 'type-fest'

import { attachments } from '#kernel/data/attachment/attachment.table'

export const AttachmentEntity = createSelectSchema(attachments)

export const AttachmentEntityInsert = createInsertSchema(attachments)

export type AttachmentEntityWhere = Types.Simplify<
  { readonly id: string | ReadonlyArray<string> } & Partial<
    Pick<typeof AttachmentEntity.Type, 'userId' | 'messageId'>
  >
>

export type AttachmentEntitySet = Types.Simplify<
  RequireAtLeastOne<Pick<typeof AttachmentEntity.Type, 'messageId' | 'chatId'>>
>
