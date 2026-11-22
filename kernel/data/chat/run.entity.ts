import { Schema, type Types } from 'effect'
import type { RequireAtLeastOne } from 'type-fest'

import { MessageColumns } from '#kernel/data/chat/message.table'
import { RunColumns } from '#kernel/data/chat/run.table'

/**
 * A Run with the message it answers and its reply, none until it is done: every read nests them,
 * flat.
 */
export const RunEntity = Schema.Struct({
  ...RunColumns.fields,
  userMessage: MessageColumns,
  assistantMessage: Schema.NullOr(MessageColumns),
})
export type RunEntity = typeof RunEntity.Type

/** `userId` is the owner of the Run's chat, not a column of `runs`. */
export type RunEntityWhere = Types.Simplify<
  Pick<RunEntity, 'id'> &
    Partial<{
      readonly chatId: RunEntity['chatId']
      readonly userId: string
      readonly status: ReadonlyArray<RunEntity['status']>
    }>
>

/** A read finds its Run by the key or by its user message, exactly one, narrowed by the rest. */
export type RunEntitySelectWhere =
  | Types.Simplify<RunEntityWhere & { readonly userMessageId?: never }>
  | Types.Simplify<
      Pick<RunEntity, 'userMessageId'> &
        Partial<Omit<RunEntityWhere, 'id'>> & { readonly id?: never }
    >

/** The columns an update may write. */
export const runSetColumns = [
  'status',
  'failure',
  'assistantMessageId',
  'updatedAt',
] as const satisfies ReadonlyArray<keyof RunColumns>

export type RunEntitySet = Types.Simplify<
  RequireAtLeastOne<Pick<RunColumns, (typeof runSetColumns)[number]>>
>

export const newestFirst = { createdAt: 'desc', id: 'desc' } as const
