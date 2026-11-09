import { createInsertSchema, createSelectSchema } from 'drizzle-orm/effect-schema'
import { Schema, type Types } from 'effect'
import type { RequireAtLeastOne } from 'type-fest'

import { MessageEntity, withAttachments } from '#kernel/data/chat/message.entity'
import { RunFailureJson, RunProvenanceJson, runs } from '#kernel/data/chat/message.table'

const refine = { failure: () => RunFailureJson, provenance: () => RunProvenanceJson }

/** A Run with the message it answers and its reply, none until it is done: every read nests them. */
export const RunEntity = Schema.Struct({
  ...createSelectSchema(runs, refine).fields,
  userMessage: MessageEntity,
  assistantMessage: Schema.NullOr(MessageEntity),
})
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

export const withMessages = {
  userMessage: { with: withAttachments },
  assistantMessage: { with: withAttachments },
} as const
