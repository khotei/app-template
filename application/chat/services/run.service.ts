import { Context, DateTime, Effect, Layer, Schema, type Types } from 'effect'

import type { UserId } from '@app-template/application/identity'
import { RunRepository } from '@app-template/kernel/data'
import { decodeWith, encodeWith, idGenerator } from '@app-template/packages/schema'

import type { MessageFields } from '#chat/domain/message.model'
import { RunNotFoundError } from '#chat/domain/run.error'
import { Run } from '#chat/domain/run.model'
import { RunId } from '#chat/domain/run.util'
import { RunFields, type RunStatus } from '#chat/domain/run-fields.model'

/** `userId` limits a read to the user's chats, which every api caller passes. */
type RunNarrowing = Partial<
  Pick<Run, 'chatId'> & {
    readonly userId: UserId
    readonly status: ReadonlyArray<RunStatus>
  }
>

/** A Run by its `id` or by its `userMessageId`, exactly one, narrowed by the rest. */
export type RunWhere =
  | Types.Simplify<Pick<Run, 'id'> & { readonly userMessageId?: never } & RunNarrowing>
  | Types.Simplify<Pick<Run, 'userMessageId'> & { readonly id?: never } & RunNarrowing>

/** A Run by its `id`, narrowed by the rest, as a write finds it. */
type RunUpdateWhere = Types.Simplify<Pick<Run, 'id'> & RunNarrowing>

export class RunService extends Context.Service<
  RunService,
  {
    readonly create: (userMessage: MessageFields) => Effect.Effect<Run>
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
      runs.selectOne(where).pipe(
        Effect.flatMap(decodeWith(Schema.Option(Run))),
        // The error's schema keeps the key of `where` alone, dropping what narrowed it.
        Effect.flatMap(Effect.fromOption(() => new RunNotFoundError({ where }))),
      ),
    )

    const update = Effect.fn('RunService.update')(function* (to: Run, where: RunUpdateWhere) {
      const updatedAt = yield* DateTime.now
      const updated = new Run({ ...to, updatedAt })
      const row = yield* encodeWith(RunFields)(updated)

      yield* runs.update(row, where)
      return updated
    })

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
