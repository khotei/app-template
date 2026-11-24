import { Context, Effect, Layer, Schema, Struct, type Types } from 'effect'

import type { UserId } from '@app-template/application/identity'
import { RunRepository, type Where } from '@app-template/kernel/data'
import { decodeWith, encodeWith } from '@app-template/packages/schema'

import { RunNotFoundError } from '#chat/domain/run.error'
import { Run } from '#chat/domain/run.model'

/** The fields a `where` names as the Run's row holds them, so it reaches the repository as it is. */
type RunFields = Pick<Run, 'id' | 'userMessageId' | 'chatId' | 'status'>

/** `userId` limits a read to the user's chats, which every api caller passes. */
interface RunOwner {
  readonly userId?: UserId
}

/** A Run by its `id` or by its `userMessageId`, narrowed by the rest. */
export type RunWhere = Types.Simplify<Where<RunFields, 'id' | 'userMessageId'> & RunOwner>

/** A Run by its `id`, narrowed by the rest, as a write finds it. */
type RunUpdateWhere = Types.Simplify<Where<RunFields, 'id'> & RunOwner>

export class RunService extends Context.Service<
  RunService,
  {
    readonly create: (
      fields: Types.Simplify<Pick<Run, 'chatId' | 'userMessageId'>>,
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
      fields: Types.Simplify<Pick<Run, 'chatId' | 'userMessageId'>>,
    ) {
      const inserted = yield* Run.insert.makeEffect(fields)
      const row = yield* encodeWith(Run.insert)(inserted)

      yield* runs.insert(row)
      return new Run(inserted)
    }, Effect.orDie)

    const getOne = Effect.fn('RunService.getOne')(
      (where: RunWhere) => runs.selectOne(where),
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

      yield* runs.update(row, where)
      return new Run({ ...to, ...set })
    }, Effect.orDie)

    const move = Effect.fn('RunService.move')(function* (
      run: Run,
      transition: (run: Run) => Effect.Effect<Run>,
    ) {
      const to = yield* transition(run)
      return yield* update(to, { id: run.id, status: [run.status] })
    })

    return { create, getOne, update, move }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
