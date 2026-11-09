import { createInsertSchema, createSelectSchema } from 'drizzle-orm/effect-schema'
import type { Types } from 'effect'
import type { RequireAtLeastOne } from 'type-fest'

import { RunFailureJson, RunProvenanceJson, runs } from '#kernel/data/chat/run.table'

const refine = { failure: () => RunFailureJson, provenance: () => RunProvenanceJson }

export const RunEntity = createSelectSchema(runs, refine)
export type RunEntity = typeof RunEntity.Type

export const RunEntityInsert = createInsertSchema(runs, refine)

/** `userId` is the owner of the Run's chat, not a column of `runs`. */
export type RunEntityWhere = Types.Simplify<
  RequireAtLeastOne<Pick<RunEntity, 'id' | 'chatId'>> &
    Partial<{
      readonly userId: string
      readonly status: ReadonlyArray<RunEntity['status']>
    }>
>

export type RunEntitySet = Types.Simplify<
  RequireAtLeastOne<Pick<RunEntity, 'status' | 'failure' | 'updatedAt'>>
>
