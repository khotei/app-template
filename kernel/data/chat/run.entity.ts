import type { Types } from 'effect'
import type { RequireAtLeastOne } from 'type-fest'

import type { RunColumns } from '#kernel/data/chat/run.table'

/**
 * A Run nests nothing, so every read returns its `RunColumns`. `userId` is the owner of the Run's
 * chat, not a column of `runs`.
 */
export type RunEntityWhere = Types.Simplify<
  Pick<RunColumns, 'id'> &
    Partial<{
      readonly chatId: RunColumns['chatId']
      readonly userId: string
      readonly status: ReadonlyArray<RunColumns['status']>
    }>
>

/** A read finds its Run by the key or by its user message, exactly one, narrowed by the rest. */
export type RunEntitySelectWhere =
  | Types.Simplify<RunEntityWhere & { readonly userMessageId?: never }>
  | Types.Simplify<
      Pick<RunColumns, 'userMessageId'> &
        Partial<Omit<RunEntityWhere, 'id'>> & { readonly id?: never }
    >

/** The columns an update may write. */
export const runSetColumns = [
  'status',
  'failure',
  'assistantMessageId',
  'updatedAt',
] as const satisfies ReadonlyArray<keyof RunColumns>

/** What an update is handed: the columns it writes, and the row's key it leaves as it is. */
export type RunEntitySet = Types.Simplify<
  Partial<Pick<RunColumns, 'id'>> &
    RequireAtLeastOne<Pick<RunColumns, (typeof runSetColumns)[number]>>
>

export const newestFirst = { createdAt: 'desc', id: 'desc' } as const
