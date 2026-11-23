import { Context, Effect, Layer, Struct, type Types } from 'effect'

import type { UserId } from '@app-template/application/identity'

import type { MessageFields } from '#chat/domain/message.model'
import { RunNotFoundError } from '#chat/domain/run.error'
import { Run } from '#chat/domain/run.model'
import { RunFields, type RunStatus } from '#chat/domain/run-fields.model'
import { RunRepository } from '#chat/services/run.repository'

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

export class RunService extends Context.Service<
  RunService,
  {
    readonly create: (userMessage: MessageFields) => Effect.Effect<Run>
    readonly getOne: (where: RunWhere) => Effect.Effect<Run, RunNotFoundError>
    /**
     * Moves `run` by the model's `transition` and moves its `updatedAt`, written under the status
     * it was read in, so a write that moved it since makes this one die.
     */
    readonly move: (run: Run, transition: (run: Run) => Effect.Effect<Run>) => Effect.Effect<Run>
  }
>()('@app-template/application/chat/services/RunService', {
  make: Effect.gen(function* () {
    const runs = yield* RunRepository

    const create = Effect.fn('RunService.create')(function* (userMessage: MessageFields) {
      const row = yield* RunFields.insert.makeEffect({
        chatId: userMessage.chatId,
        userMessageId: userMessage.id,
      })

      yield* runs.insert(row)
      return new Run({ ...row, userMessage })
    }, Effect.orDie)

    const getOne = Effect.fn('RunService.getOne')(
      (where: RunWhere) => runs.selectOne(where),
      // The error's schema keeps the key of `where` alone, dropping what narrowed it.
      (found, where) =>
        Effect.flatMap(
          found,
          Effect.fromOption(() => new RunNotFoundError({ where })),
        ),
    )

    const move = Effect.fn('RunService.move')(function* (
      run: Run,
      transition: (run: Run) => Effect.Effect<Run>,
    ) {
      const to = yield* transition(run)
      const set = yield* RunFields.update.makeEffect(Struct.omit(to, ['updatedAt']))

      yield* runs.update(set, run.status)
      return new Run({ ...to, ...set })
    }, Effect.orDie)

    return { create, getOne, move }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
