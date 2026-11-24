import { Schema, type Types } from 'effect'
import type { RequireAtLeastOne } from 'type-fest'

import type { Where } from '@app-template/packages/db'

import { ChatColumns } from '#kernel/data/chat/chat.table'
import { RunColumns } from '#kernel/data/chat/run.table'

/** A chat with its newest Run, flat, none before its first ask: every read nests it. */
export const ChatEntity = Schema.Struct({
  ...ChatColumns.fields,
  run: Schema.NullOr(RunColumns),
})
export type ChatEntity = typeof ChatEntity.Type

/** A write finds its chat by the key, narrowed by the rest. */
export type ChatEntityWhere = Where<ChatColumns, 'id'>

/** A read finds a chat by the key or a user's chats by their owner, narrowed by the rest. */
export type ChatEntitySelectWhere = Where<ChatColumns, 'id' | 'userId'>

/** The columns an update may write. */
export const chatSetColumns = ['title', 'updatedAt'] as const satisfies ReadonlyArray<
  keyof ChatColumns
>

/** What an update is handed: the columns it writes, and the row's key it leaves as it is. */
export type ChatEntitySet = Types.Simplify<
  Partial<Pick<ChatColumns, 'id'>> &
    RequireAtLeastOne<Pick<ChatColumns, (typeof chatSetColumns)[number]>>
>
