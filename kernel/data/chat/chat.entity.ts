import { createInsertSchema, createSelectSchema } from 'drizzle-orm/effect-schema'
import { Schema, type Types } from 'effect'
import type { RequireAtLeastOne } from 'type-fest'

import { AttachmentEntity } from '#kernel/data/attachment/attachment.entity'
import { chats } from '#kernel/data/chat/chat.table'

/**
 * A chat with its attachments, in upload order: every read nests them (`withAttachments` in
 * `message.entity.ts`).
 */
export const ChatEntity = Schema.Struct({
  ...createSelectSchema(chats).fields,
  attachments: Schema.Array(AttachmentEntity),
})
export type ChatEntity = typeof ChatEntity.Type

export const ChatEntityInsert = createInsertSchema(chats)

export type ChatEntityWhere = Types.Simplify<
  RequireAtLeastOne<Pick<ChatEntity, 'id' | 'userId'>> &
    Partial<Pick<ChatEntity, 'title' | 'status'>>
>

export type ChatEntitySet = Types.Simplify<
  RequireAtLeastOne<Pick<ChatEntity, 'title' | 'status' | 'updatedAt'>>
>
