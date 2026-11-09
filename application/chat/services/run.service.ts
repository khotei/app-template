import { Context, Effect, Layer, type Types } from 'effect'

import type { UserId } from '@app-template/application/identity'
import { RunRepository } from '@app-template/kernel/data'

import { RunNotFoundError } from '#chat/domain/run.error'
import type { Run } from '#chat/domain/run.model'
import { decodeRun } from '#chat/services/run.mapper'

/** The Run of the user's chat; one of another user's chat reads as absent. */
export type RunWhere = Types.Simplify<Pick<Run, 'id' | 'chatId'> & { readonly userId: UserId }>

export class RunService extends Context.Service<
  RunService,
  {
    readonly getOne: (where: RunWhere) => Effect.Effect<Run, RunNotFoundError>
  }
>()('@app-template/application/chat/services/RunService', {
  make: Effect.gen(function* () {
    const runs = yield* RunRepository

    const getOne = Effect.fn('RunService.getOne')((where: RunWhere) =>
      runs
        .selectOne(where)
        .pipe(
          Effect.flatMap(decodeRun),
          Effect.flatMap(Effect.fromOption(() => new RunNotFoundError({ id: where.id }))),
        ),
    )

    return { getOne }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
