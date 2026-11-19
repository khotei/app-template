import { Schema, type Types } from 'effect'
import type { RequireAtLeastOne } from 'type-fest'

import { ChatColumns } from '#kernel/data/chat/chat.table'
import { RunColumns } from '#kernel/data/chat/run.table'

/** A chat with its newest Run, flat, none before its first send: every read nests it. */
export const ChatEntity = Schema.Struct({
  ...ChatColumns.fields,
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
