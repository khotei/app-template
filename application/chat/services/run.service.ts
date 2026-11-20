import { Context, DateTime, Effect, Layer, Schema, type Types } from 'effect'

import type { UserId } from '@app-template/application/identity'
import { type RunEntityWhere, RunRepository } from '@app-template/kernel/data'
import { decodeWith, encodeWith, idGenerator } from '@app-template/packages/schema'

import type { MessageFields } from '#chat/domain/message.model'
import { RunNotFoundError, type RunStatusInvalidError } from '#chat/domain/run.error'
import { failRun, Run } from '#chat/domain/run.model'
import { RunId } from '#chat/domain/run.util'
import { type RunFailure, RunFields } from '#chat/domain/run-fields.model'

/** A Run by id; `userId` limits it to the user's chats, which every api caller passes. */
export type RunWhere = Types.Simplify<
  Pick<Run, 'id'> & Partial<Pick<Run, 'chatId'> & { readonly userId: UserId }>
>

export class RunService extends Context.Service<
  RunService,
  {
    readonly create: (userMessage: MessageFields) => Effect.Effect<Run>
    readonly getOne: (where: RunWhere) => Effect.Effect<Run, RunNotFoundError>
    /** Dies when no Run matches `where`. */
    readonly update: (run: Run, where: RunEntityWhere) => Effect.Effect<Run>
    /** Fails the Run with `failure` and writes it under the status it is given in. */
    readonly fail: (run: Run, failure: RunFailure) => Effect.Effect<Run, RunStatusInvalidError>
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

    const update = Effect.fn('RunService.update')(function* (run: Run, where: RunEntityWhere) {
      const updatedAt = yield* DateTime.now
      const stamped = new Run({ ...run, updatedAt })
      const row = yield* encodeWith(RunFields)(stamped)

      yield* runs.update(row, where)
      return stamped
    })

    const fail = Effect.fn('RunService.fail')((run: Run, failure: RunFailure) =>
      failRun(run, failure).pipe(
        Effect.flatMap((failed) => update(failed, { id: run.id, status: [run.status] })),
      ),
    )

    return { create, getOne, update, fail }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
