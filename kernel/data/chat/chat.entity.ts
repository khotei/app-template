import { Schema, type Types } from 'effect'
import type { RequireAtLeastOne } from 'type-fest'

import { AttachmentEntity } from '#kernel/data/attachment/attachment.entity'
import { ChatColumns } from '#kernel/data/chat/chat.table'
import { newestFirst } from '#kernel/data/chat/run.entity'
import { RunColumns } from '#kernel/data/chat/run.table'

/**
 * A chat with its attachments, in upload order, and its newest Run, flat, none before its first
 * send: every read nests them (`withAttachments` in `message.entity.ts`, `withRun`).
 */
export const ChatEntity = Schema.Struct({
  ...ChatColumns.fields,
  attachments: Schema.Array(AttachmentEntity),
  run: Schema.NullOr(RunColumns),
})
export type ChatEntity = typeof ChatEntity.Type

export type ChatEntityWhere = Types.Simplify<
  RequireAtLeastOne<Pick<ChatEntity, 'id' | 'userId'>> & Partial<Pick<ChatEntity, 'title'>>
>

/** The columns an update may write. */
export const chatSetColumns = ['title', 'updatedAt'] as const satisfies ReadonlyArray<
  keyof ChatColumns
>

export type ChatEntitySet = Types.Simplify<
  RequireAtLeastOne<Pick<ChatColumns, (typeof chatSetColumns)[number]>>
>

/** The newest Run: the relation is one of many, so the read orders it. */
export const withRun = { run: { orderBy: newestFirst } } as const
