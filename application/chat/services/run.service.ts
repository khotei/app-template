import { Context, Effect, Layer, Schema, Struct, type Types } from 'effect'

import { encodeWhere, RunRepository } from '@app-template/kernel/data'
import { decodeWith, encodeWith } from '@app-template/packages/schema'

import { RunNotFoundError } from '#chat/domain/run.error'
import { Run, type RunStatus } from '#chat/domain/run.model'

export type RunCreate = Types.Simplify<Pick<Run, 'chatId' | 'userId' | 'userMessageId'>>

/**
 * A Run as a read finds it: a user's by its id in its chat, which a call on a user's behalf
 * reads, or a message's in one of the statuses `status` lists, which its job reads.
 */
export type RunWhere =
  | Types.Simplify<Pick<Run, 'id' | 'chatId' | 'userId'>>
  | Types.Simplify<Pick<Run, 'userMessageId'> & { readonly status: ReadonlyArray<RunStatus> }>

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
      const inserted = yield* Run.insert.makeEffect(fields)
      const row = yield* encodeWith(Run.insert)(inserted)

      yield* runs.insert(row)
      return new Run(inserted)
    }, Effect.orDie)

    const getOne = Effect.fn('RunService.getOne')(
      (where: RunWhere) => runs.selectOne(encodeWhere(where)),
      Effect.flatMap(decodeWith(Schema.Option(Run))),
      // The error's schema keeps the key of `where` alone, dropping what narrowed it.
      (found, where) =>
        Effect.flatMap(
          found,
          Effect.fromOption(() => new RunNotFoundError({ where })),
        ),
    )

    const update = Effect.fn('RunService.update')(function* (from: Run, to: Run) {
      // Without `to`'s `updatedAt`, so the update variant's default moves it to now.
      const set = yield* Run.update.makeEffect(Struct.omit(to, ['updatedAt']))
      const row = yield* encodeWith(Run.update)(set)

      yield* runs.update(row, encodeWhere(Struct.pick(from, ['id', 'status'])))
      return new Run({ ...to, ...set })
    }, Effect.orDie)

    return { create, getOne, update }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
