import type { TableFilter } from 'drizzle-orm'
import type { Types } from 'effect'
import type { RequireAtLeastOne } from 'type-fest'

import type { Keyed } from '@app-template/packages/db'

import type { RunColumns, runs } from '#kernel/data/chat/run.table'

/** A Run nests nothing, so every read returns its `RunColumns`. A write finds its Run by the key. */
export type RunEntityWhere = Keyed<TableFilter<typeof runs>, RunColumns, 'id'>

/** A read finds its Run by the key or by its user message, narrowed by the rest. */
export type RunEntitySelectWhere = Keyed<
  TableFilter<typeof runs>,
  RunColumns,
  'id' | 'userMessageId'
>

/** What `RunRepository` builds its statements from. */
export class RunRow {
  /** The columns an update may write. */
  static readonly setColumns = [
    'status',
    'failure',
    'assistantMessageId',
    'usage',
    'updatedAt',
  ] as const satisfies ReadonlyArray<keyof RunColumns>
}

/** What an update is handed: the columns it writes, and the row's key it leaves as it is. */
export type RunEntitySet = Types.Simplify<
  Partial<Pick<RunColumns, 'id'>> &
    RequireAtLeastOne<Pick<RunColumns, (typeof RunRow.setColumns)[number]>>
>
