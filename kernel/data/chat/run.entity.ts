import { createInsertSchema } from 'drizzle-orm/effect-schema'
import { Schema, type Types } from 'effect'
import type { RequireAtLeastOne } from 'type-fest'

import { MessageColumns } from '#kernel/data/chat/message.table'
import { RunColumns, runJsonColumns, runs } from '#kernel/data/chat/run.table'

/**
 * A Run with the message it answers and its reply, none until it is done: every read nests them
 * (`withMessages`), flat, without their attachments.
 */
export const RunEntity = Schema.Struct({
  ...RunColumns.fields,
  userMessage: MessageColumns,
  assistantMessage: Schema.NullOr(MessageColumns),
})
export type RunEntity = typeof RunEntity.Type

export const RunEntityInsert = createInsertSchema(runs, runJsonColumns)

/** `userId` is the owner of the Run's chat, not a column of `runs`. */
export type RunEntityWhere = Types.Simplify<
  RequireAtLeastOne<Pick<RunEntity, 'id' | 'chatId'>> &
    Partial<{
      readonly userId: string
      readonly status: ReadonlyArray<RunEntity['status']>
    }>
>

export type RunEntitySet = Types.Simplify<
  RequireAtLeastOne<Pick<RunEntity, 'status' | 'failure' | 'assistantMessageId' | 'updatedAt'>>
>

export const newestFirst = { createdAt: 'desc', id: 'desc' } as const

export const withMessages = { userMessage: true, assistantMessage: true } as const
