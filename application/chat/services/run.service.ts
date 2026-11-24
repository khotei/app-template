import { Array as Arr, Context, Effect, Layer, Schema, Struct, type Types } from 'effect'

import { RunRepository } from '@app-template/kernel/data'
import { decodeWith, encodeWith } from '@app-template/packages/schema'

import { RunNotFoundError } from '#chat/domain/run.error'
import { Run, type RunStatus } from '#chat/domain/run.model'

/** A Run by id in its chat, of the user `userId` names: what a call on a user's behalf reads. */
export type RunOwnerWhere = Types.Simplify<Pick<Run, 'id' | 'chatId' | 'userId'>>

/** The Run of a user's message in one of the statuses `status` lists: what its job reads. */
export type RunMessageWhere = Types.Simplify<
  Pick<Run, 'userMessageId'> & { readonly status: ReadonlyArray<RunStatus> }
>

/** A Run as a read finds it: a user's by its id, or a message's by its status. */
export type RunWhere = RunOwnerWhere | RunMessageWhere

/** A Run by its `id` under the status it must still hold, as a write finds it. */
type RunUpdateWhere = Types.Simplify<Pick<Run, 'id' | 'status'>>

export class RunService extends Context.Service<
  RunService,
  {
    readonly create: (
      fields: Types.Simplify<Pick<Run, 'chatId' | 'userId' | 'userMessageId'>>,
    ) => Effect.Effect<Run>
    readonly getOne: (where: RunWhere) => Effect.Effect<Run, RunNotFoundError>
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

    const create = Effect.fn('RunService.create')(function* (
      fields: Types.Simplify<Pick<Run, 'chatId' | 'userId' | 'userMessageId'>>,
    ) {
      const inserted = yield* Run.insert.makeEffect(fields)
      const row = yield* encodeWith(Run.insert)(inserted)

      yield* runs.insert(row)
      return new Run(inserted)
    }, Effect.orDie)

    const getOne = Effect.fn('RunService.getOne')(
      // The owner is read first, so a where that names one is never found without it.
      (where: RunWhere) =>
        runs.selectOne(
          'userId' in where
            ? { id: where.id, chatId: where.chatId, userId: where.userId }
            : { userMessageId: where.userMessageId, status: { in: Arr.copy(where.status) } },
        ),
      Effect.flatMap(decodeWith(Schema.Option(Run))),
      // The error's schema keeps the key of `where` alone, dropping what narrowed it.
      (found, where) =>
        Effect.flatMap(
          found,
          Effect.fromOption(() => new RunNotFoundError({ where })),
        ),
    )

    const update = Effect.fn('RunService.update')(function* (
      to: Run,
      { id, status }: RunUpdateWhere,
    ) {
      // Without `to`'s `updatedAt`, so the update variant's default moves it to now.
      const set = yield* Run.update.makeEffect(Struct.omit(to, ['updatedAt']))
      const row = yield* encodeWith(Run.update)(set)

      yield* runs.update(row, { id, status })
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
