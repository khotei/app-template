import { Array as Arr, Context, Effect, Layer, type Option, Schema, UndefinedOr } from 'effect'
import { SqlClient, SqlModel, SqlSchema } from 'effect/sql'

import { UserId } from '@app-template/application/identity'
import { buildWhereFragment, orDieUnless } from '@app-template/packages/db'

import { ChatId } from '#chat/domain/chat.util'
import { MessageId } from '#chat/domain/message.util'
import { Run, RunStatus } from '#chat/domain/run.model'
import { RunId } from '#chat/domain/run.util'

/** `userId` is the owner of the Run's chat, so a Run of another user's chat reads as absent. */
export const RunFilter = Schema.Struct({
  id: Schema.optional(RunId),
  userMessageId: Schema.optional(MessageId),
  chatId: Schema.optional(ChatId),
  userId: Schema.optional(UserId),
  status: Schema.optional(Schema.Array(RunStatus)),
})
export type RunFilter = typeof RunFilter.Type

/** The Run's new fields and the status it must still be in, which the write's `where` holds. */
const RunMove = Schema.Struct({ to: Run.update, from: RunStatus })

export class RunRepository extends Context.Service<
  RunRepository,
  {
    /** Dies when the Run is active and its chat already has one. */
    readonly insert: (run: typeof Run.insert.Type) => Effect.Effect<void>
    /**
     * Writes `to` on its Run while that Run is still `from`; dies when it is not, as another
     * writer moved it since it was read.
     */
    readonly update: (to: typeof Run.update.Type, from: RunStatus) => Effect.Effect<void>
    readonly selectOne: (where: RunFilter) => Effect.Effect<Option.Option<Run>>
  }
>()('@app-template/application/chat/services/RunRepository', {
  make: Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const table = yield* SqlModel.makeRepository(Run, {
      tableName: 'runs',
      spanPrefix: 'RunRepository',
      idColumn: 'id',
    })

    const encodeWhere = buildWhereFragment<typeof RunFilter.Encoded>({
      id: UndefinedOr.map((id) => sql`runs.id = ${id}`),
      userMessageId: UndefinedOr.map((id) => sql`runs.user_message_id = ${id}`),
      chatId: UndefinedOr.map((chatId) => sql`runs.chat_id = ${chatId}`),
      userId: UndefinedOr.map(
        (userId) => sql`runs.chat_id in (select id from chats where user_id = ${userId})`,
      ),
      status: UndefinedOr.map((statuses) => sql`runs.status in ${sql.in(statuses)}`),
    })

    // `makeRepository`'s update matches by id alone; this one also by the status it moves from.
    const updateFrom = SqlSchema.findAll({
      Request: RunMove,
      Result: Schema.Struct({ id: RunId }),
      execute: ({ to, from }) => sql`
        update runs set ${sql.update(to, ['id'])}
        where runs.id = ${to.id} and runs.status = ${from}
        returning runs.id`,
    })

    const findFirst = SqlSchema.findOneOption({
      Request: RunFilter,
      Result: Run,
      execute: (where) => sql`
        select * from runs where ${encodeWhere(where)} limit 1`,
    })

    return {
      insert: Effect.fn('RunRepository.insert')(table.insertVoid, Effect.orDie),
      update: Effect.fn('RunRepository.update')(
        (to: typeof Run.update.Type, from: RunStatus) => updateFrom({ to, from }),
        orDieUnless(Arr.isReadonlyArrayNonEmpty, 'no run was updated'),
        Effect.orDie,
      ),
      selectOne: Effect.fn('RunRepository.selectOne')(findFirst, Effect.orDie),
    }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
