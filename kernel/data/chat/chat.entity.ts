import { createInsertSchema, createSelectSchema } from 'drizzle-orm/effect-schema'
import { Schema, type Types } from 'effect'
import type { RequireAtLeastOne } from 'type-fest'

import { AttachmentEntity } from '#kernel/data/attachment/attachment.entity'
import { chats } from '#kernel/data/chat/chat.table'
import { RunEntity, withMessages } from '#kernel/data/chat/run.entity'

/**
 * A chat with its attachments, in upload order, and its newest Run, none before its first send:
 * every read nests them (`withAttachments` in `message.entity.ts`, `withLatestRun`).
 */
export const ChatEntity = Schema.Struct({
  ...createSelectSchema(chats).fields,
  attachments: Schema.Array(AttachmentEntity),
  latestRun: Schema.NullOr(RunEntity),
})
export type ChatEntity = typeof ChatEntity.Type

export const ChatEntityInsert = createInsertSchema(chats)

export type ChatEntityWhere = Types.Simplify<
  RequireAtLeastOne<Pick<ChatEntity, 'id' | 'userId'>> & Partial<Pick<ChatEntity, 'title'>>
>

export type ChatEntitySet = Types.Simplify<
  RequireAtLeastOne<Pick<ChatEntity, 'title' | 'updatedAt'>>
>

export const withLatestRun = {
  latestRun: { orderBy: { createdAt: 'desc', id: 'desc' }, with: withMessages },
} as const
