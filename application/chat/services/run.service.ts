import { Context, DateTime, Effect, Layer, Schema, type Types } from 'effect'

import type { UserId } from '@app-template/application/identity'
import { RunRepository } from '@app-template/kernel/data'
import { decodeWith, encodeWith, idGenerator } from '@app-template/packages/schema'

import type { MessageFields } from '#chat/domain/message.model'
import type { MessageId } from '#chat/domain/message.util'
import { ActiveRunNotFoundError, RunNotFoundError } from '#chat/domain/run.error'
import { activeRunStatuses, Run } from '#chat/domain/run.model'
import { RunId } from '#chat/domain/run.util'
import { RunFields, type RunStatus } from '#chat/domain/run-fields.model'

/**
 * A Run by id; `userId` limits it to the user's chats, which every api caller passes, and
 * `status` to the Runs in one of them.
 */
export type RunWhere = Types.Simplify<
  Pick<Run, 'id'> &
    Partial<
      Pick<Run, 'chatId'> & {
        readonly userId: UserId
        readonly status: ReadonlyArray<RunStatus>
      }
    >
>

export class RunService extends Context.Service<
  RunService,
  {
    readonly create: (userMessage: MessageFields) => Effect.Effect<Run>
    readonly getOne: (where: RunWhere) => Effect.Effect<Run, RunNotFoundError>
    /** The active Run of the user's message `userMessageId`. */
    readonly getActive: (userMessageId: MessageId) => Effect.Effect<Run, ActiveRunNotFoundError>
    /**
     * Writes `run` moved by the model's `move` under the status it was read in, so a write that
     * moved it since makes this one die.
     */
    readonly update: (run: Run, move: (run: Run) => Effect.Effect<Run>) => Effect.Effect<Run>
  }
>()('@app-template/application/chat/services/RunService', {
  make: Effect.gen(function* () {
    const runs = yield* RunRepository
    const generateId = yield* idGenerator

    const create = Effect.fn('RunService.create')(function* (userMessage: MessageFields) {
      const id = yield* generateId(RunId)
      const createdAt = yield* DateTime.now
      const run = new Run({
        id,
        chatId: userMessage.chatId,
        userMessage,
        userMessageId: userMessage.id,
        createdAt,
        updatedAt: createdAt,
      })
      const row = yield* encodeWith(RunFields)(run)

      yield* runs.insert(row)
      return run
    })

    const getOne = Effect.fn('RunService.getOne')((where: RunWhere) =>
      runs
        .selectOne(where)
        .pipe(
          Effect.flatMap(decodeWith(Schema.Option(Run))),
          Effect.flatMap(Effect.fromOption(() => new RunNotFoundError({ id: where.id }))),
        ),
    )

    const getActive = Effect.fn('RunService.getActive')((userMessageId: MessageId) =>
      runs
        .selectOne({ userMessageId, status: activeRunStatuses })
        .pipe(
          Effect.flatMap(decodeWith(Schema.Option(Run))),
          Effect.flatMap(Effect.fromOption(() => new ActiveRunNotFoundError({ userMessageId }))),
        ),
    )

    const update = Effect.fn('RunService.update')(function* (
      run: Run,
      move: (run: Run) => Effect.Effect<Run>,
    ) {
      const moved = yield* move(run)
      const updatedAt = yield* DateTime.now
      const stamped = new Run({ ...moved, updatedAt })
      const row = yield* encodeWith(RunFields)(stamped)

      yield* runs.update(row, { id: run.id, status: [run.status] })
      return stamped
    })

    return { create, getOne, getActive, update }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
