import { Schema, type Types } from 'effect'
import { Model } from 'effect/schema'
import type { RequireAtLeastOne } from 'type-fest'

import { MessageColumns } from '#kernel/data/chat/message.table'
import { RunColumns, RunFailure } from '#kernel/data/chat/run.table'

const { chatId, userMessageId, createdAt } = RunColumns.fields

/** Written once, by the insert. */
const insertOnly = Model.FieldExcept(['update', 'jsonUpdate'])

/**
 * A Run's row: an update, found by `id`, writes its status, failure, reply and `updatedAt` alone. `failure` is
 * written as JSON text, which Postgres reads into its `jsonb`, since `@effect/sql-pg` infers a type
 * for no object; it is read back parsed.
 */
export class RunRow extends Model.Class<RunRow>('RunRow')({
  ...RunColumns.fields,
  chatId: insertOnly(chatId),
  userMessageId: insertOnly(userMessageId),
  createdAt: insertOnly(createdAt),
  failure: Model.Field({
    select: Schema.NullOr(RunFailure),
    insert: Schema.NullOr(Schema.fromJsonString(RunFailure)),
    update: Schema.NullOr(Schema.fromJsonString(RunFailure)),
    json: Schema.NullOr(RunFailure),
  }),
}) {}

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

/** The fields of `RunRow.update` but its key, which finds the row. */
export type RunEntitySet = Types.Simplify<
  RequireAtLeastOne<Pick<RunColumns, Exclude<keyof typeof RunRow.update.fields, 'id'>>>
>

export const newestFirst = { createdAt: 'desc', id: 'desc' } as const
