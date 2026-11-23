import { PgTypes } from '@effect/sql-pg'
import {
  Array as Arr,
  Context,
  Effect,
  flow,
  Layer,
  type Option,
  pipe,
  Schema,
  Struct,
  type Types,
  UndefinedOr,
} from 'effect'
import { SqlClient } from 'effect/sql'

import {
  buildColumns,
  buildFields,
  buildWhereFragment,
  orDieUnless,
} from '@app-template/packages/db'

import { MessageColumns } from '#kernel/data/chat/message.table'
import {
  RunEntity,
  type RunEntitySelectWhere,
  type RunEntitySet,
  type RunEntityWhere,
  runSetColumns,
} from '#kernel/data/chat/run.entity'
import { RunColumns } from '#kernel/data/chat/run.table'

const runColumns = Struct.keys(RunColumns.fields)

/** A message as `to_jsonb` nests it, its timestamp as text. */
const NestedMessage = Schema.toCodecJson(MessageColumns)

/** A Run as its read selects it. */
const RunRead = Schema.Struct({
  ...RunEntity.fields,
  userMessage: NestedMessage,
  assistantMessage: Schema.NullOr(NestedMessage),
})

/** `@effect/sql-pg` infers a type for no object, so `failure` binds as a `jsonb` parameter. */
const encodeFailure = (run: Partial<RunColumns>) =>
  Struct.evolve(run, { failure: UndefinedOr.map(PgTypes.jsonb) })

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

    // `userId` is the owner of the Run's chat, so a Run of another user's chat reads as absent.
    const encodeWhere = buildWhereFragment<
      Types.Simplify<Partial<RunEntityWhere & Pick<RunEntity, 'userMessageId'>>>
    >({
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

    return {
      insert: Effect.fn('RunRepository.insert')(
        (run: RunColumns) =>
          sql`insert into runs ${sql.insert(pipe(run, encodeFailure, buildColumns(runColumns)))}`,
        Effect.orDie,
      ),
      update: Effect.fn('RunRepository.update')(
        (set: RunEntitySet, where: RunEntityWhere) => sql`
          update runs set ${sql.update(pipe(set, encodeFailure, buildColumns(runSetColumns)))}
          where ${encodeWhere(where)}
          returning runs.id`,
        orDieUnless(Arr.isReadonlyArrayNonEmpty, 'no run was updated'),
        Effect.orDie,
      ),
      selectOne: Effect.fn('RunRepository.selectOne')(
        (where: RunEntitySelectWhere) => sql`
          select runs.*,
            to_jsonb(user_message) as user_message,
            to_jsonb(assistant_message) as assistant_message
          from runs
          join messages user_message on user_message.id = runs.user_message_id
          left join messages assistant_message on assistant_message.id = runs.assistant_message_id
          where ${encodeWhere(where)}
          limit 1`,
        Effect.map(flow(buildFields, Arr.head)),
        Effect.flatMap(Schema.decodeUnknownEffect(Schema.Option(RunRead))),
        Effect.orDie,
      ),
    }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
