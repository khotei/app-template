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
export type RunGetOne =
  | Types.Simplify<Pick<Run, 'id' | 'chatId' | 'userId'>>
  | Types.Simplify<Pick<Run, 'userMessageId'> & { readonly status: ReadonlyArray<RunStatus> }>

/** A Run by its `id` under the status it must still hold, as a write finds it. */
export type RunUpdateWhere = Types.Simplify<Pick<Run, 'id' | 'status'>>

export class RunService extends Context.Service<
  RunService,
  {
    readonly create: (fields: RunCreate) => Effect.Effect<Run>
    readonly getOne: (where: RunGetOne) => Effect.Effect<Run, RunNotFoundError>
    /** Writes `to` on the Run `where` finds and moves its `updatedAt`. */
    readonly update: (to: Run, where: RunUpdateWhere) => Effect.Effect<Run>
    /**
     * Moves `run` by the model's `transition`, written under the status it was read in, so a
     * write that moved it since makes this one die.
     */
    readonly move: (run: Run, transition: (run: Run) => Effect.Effect<Run>) => Effect.Effect<Run>
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
      (where: RunGetOne) => runs.selectOne(encodeWhere(where)),
      Effect.flatMap(decodeWith(Schema.Option(Run))),
      // The error's schema keeps the key of `where` alone, dropping what narrowed it.
      (found, where) =>
        Effect.flatMap(
          found,
          Effect.fromOption(() => new RunNotFoundError({ where })),
        ),
    )

    const update = Effect.fn('RunService.update')(function* (to: Run, where: RunUpdateWhere) {
      // Without `to`'s `updatedAt`, so the update variant's default moves it to now.
      const set = yield* Run.update.makeEffect(Struct.omit(to, ['updatedAt']))
      const row = yield* encodeWith(Run.update)(set)

      yield* runs.update(row, encodeWhere(where))
      return new Run({ ...to, ...set })
    }, Effect.orDie)

    const move = Effect.fn('RunService.move')(function* (
      run: Run,
      transition: (run: Run) => Effect.Effect<Run>,
    ) {
      const to = yield* transition(run)
      return yield* update(to, { id: run.id, status: run.status })
    })

    return { create, getOne, update, move }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
