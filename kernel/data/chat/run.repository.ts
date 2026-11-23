import {
  Array as Arr,
  Context,
  Effect,
  flow,
  Layer,
  type Option,
  Predicate,
  pipe,
  Schema,
  Struct,
  UndefinedOr,
} from 'effect'
import { SqlClient, SqlModel, SqlSchema } from 'effect/sql'

import { buildWhereFragment, orDieUnless } from '@app-template/packages/db'

import { MessageColumns } from '#kernel/data/chat/message.table'
import {
  type RunEntity,
  type RunEntitySelectWhere,
  type RunEntitySet,
  type RunEntityWhere,
  RunRow,
} from '#kernel/data/chat/run.entity'
import { RunColumns } from '#kernel/data/chat/run.table'

/** The request of a read or a write's `where`: `RunEntitySelectWhere` or `RunEntityWhere`. */
const RunWhere = Schema.Struct({
  id: Schema.optional(Schema.String),
  chatId: Schema.optional(Schema.String),
  userMessageId: Schema.optional(Schema.String),
  userId: Schema.optional(Schema.String),
  status: Schema.optional(Schema.Array(RunColumns.fields.status)),
})

/** What an update writes: `RunRow.update` but its key, each field optional. */
const RunSet = RunRow.update.mapFields(flow(Struct.omit(['id']), Struct.map(Schema.optional)))

/** A message as `to_jsonb` nests it, its timestamp as text. */
const NestedMessage = Schema.toCodecJson(MessageColumns)

/** A Run as its read selects it. */
const RunRead = Schema.Struct({
  ...RunRow.fields,
  userMessage: NestedMessage,
  assistantMessage: Schema.NullOr(NestedMessage),
})

export class RunRepository extends Context.Service<
  RunRepository,
  {
    /** Dies when the Run is active and its chat already has one. */
    readonly insert: (run: RunColumns) => Effect.Effect<void>
    /** Writes the fields of `set` a Run may change where `where` holds; dies when it writes nothing. */
    readonly update: (set: RunEntitySet, where: RunEntityWhere) => Effect.Effect<void>
    /** Returns the Run where `where` holds. */
    readonly selectOne: (where: RunEntitySelectWhere) => Effect.Effect<Option.Option<RunEntity>>
  }
>()('@app-template/kernel/data/chat/RunRepository', {
  make: Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const table = yield* SqlModel.makeRepository(RunRow, {
      tableName: 'runs',
      spanPrefix: 'RunRepository',
      idColumn: 'id',
    })

    // `userId` is the owner of the Run's chat, so a Run of another user's chat reads as absent.
    const encodeWhere = buildWhereFragment<typeof RunWhere.Encoded>({
      id: UndefinedOr.map((id) => sql`runs.id = ${id}`),
      chatId: UndefinedOr.map((chatId) => sql`runs.chat_id = ${chatId}`),
      userMessageId: UndefinedOr.map(
        (userMessageId) => sql`runs.user_message_id = ${userMessageId}`,
      ),
      userId: UndefinedOr.map(
        (userId) => sql`runs.chat_id in (select id from chats where user_id = ${userId})`,
      ),
      status: UndefinedOr.map((statuses) => sql`runs.status in ${sql.in(statuses)}`),
    })

    // The guard sits in the `where`, so a Run another writer moved is missed; `makeRepository`'s
    // update matches by id alone. An `undefined` field is omitted, as `sql.update` would bind it
    // as `NULL` where Drizzle's `set` skipped it.
    const updateWhere = SqlSchema.findAll({
      Request: Schema.Struct({ set: RunSet, where: RunWhere }),
      Result: Schema.Struct({ id: Schema.String }),
      execute: ({ set, where }) => sql`
        update runs set ${sql.update(
          set,
          pipe(
            Struct.keys(set),
            Arr.filter((key) => Predicate.isUndefined(set[key])),
          ),
        )}
        where ${encodeWhere(where)}
        returning runs.id`,
    })

    const findFirst = SqlSchema.findOneOption({
      Request: RunWhere,
      Result: RunRead,
      execute: (where) => sql`
        select runs.*,
          to_jsonb(user_message) as user_message,
          to_jsonb(assistant_message) as assistant_message
        from runs
        join messages user_message on user_message.id = runs.user_message_id
        left join messages assistant_message on assistant_message.id = runs.assistant_message_id
        where ${encodeWhere(where)}
        limit 1`,
    })

    return {
      insert: Effect.fn('RunRepository.insert')(table.insertVoid, Effect.orDie),
      update: Effect.fn('RunRepository.update')(
        (set: RunEntitySet, where: RunEntityWhere) => updateWhere({ set, where }),
        orDieUnless(Arr.isReadonlyArrayNonEmpty, 'no run was updated'),
        Effect.orDie,
      ),
      selectOne: Effect.fn('RunRepository.selectOne')(findFirst, Effect.orDie),
    }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
