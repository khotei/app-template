import { Context, Effect, Layer, type Types } from 'effect'

import { encodeWhere, RunRepository } from '@app-template/kernel/data'
import { RowCodec } from '@app-template/packages/schema'

import { Run, RunNotFoundError, type RunStatus } from '#chat/domain/run.model'

export type RunCreate = Types.Simplify<Pick<Run, 'chatId' | 'userId' | 'userMessageId'>>

/**
 * A Run as a read finds it: a user's by its id in its chat, which a call on a user's behalf
 * reads, or a user's message's in its chat in one of the statuses `status` lists, which its job
 * reads.
 */
export type RunWhere =
  | Types.Simplify<Pick<Run, 'id' | 'chatId' | 'userId'>>
  | Types.Simplify<
      Pick<Run, 'userMessageId' | 'chatId' | 'userId'> & {
        readonly status: ReadonlyArray<RunStatus>
      }
    >

export class RunService extends Context.Service<
  RunService,
  {
    readonly create: (fields: RunCreate) => Effect.Effect<Run>
    readonly getOne: (where: RunWhere) => Effect.Effect<Run, RunNotFoundError>
    /**
     * Writes `to` over the Run `from` holds and moves its `updatedAt`, under the status `from` was
     * read in, so a write that moved it since makes this one die.
     */
    readonly update: (from: Run, to: Run) => Effect.Effect<Run>
  }
>()('@app-template/application/chat/services/RunService', {
  make: Effect.gen(function* () {
    const runs = yield* RunRepository

    const create = Effect.fn('RunService.create')(function* (fields: RunCreate) {
      const { set, row } = yield* RowCodec.makeInsert(Run)(fields)

      yield* runs.insert(row)
      return new Run(set)
    })

    const getOne = Effect.fn('RunService.getOne')(
      (where: RunWhere) => runs.selectOne(encodeWhere(where)),
      Effect.flatMap(RowCodec.decodeOne(Run)),
      // The error's schema keeps the key of `where` alone, dropping what narrowed it.
      (found, where) =>
        Effect.flatMap(
          found,
          Effect.fromOption(() => new RunNotFoundError({ where })),
        ),
    )

    const update = Effect.fn('RunService.update')(function* (from: Run, to: Run) {
      const { set, row } = yield* RowCodec.makeUpdate(Run)(to)

      yield* runs.update(row, encodeWhere({ id: from.id, status: from.status }))
      return new Run({ ...to, ...set })
    })

    return { create, getOne, update }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
