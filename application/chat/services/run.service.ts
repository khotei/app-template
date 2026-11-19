import { Context, DateTime, Effect, Layer, Schema, type Types } from 'effect'

import type { UserId } from '@app-template/application/identity'
import { RunRepository } from '@app-template/kernel/data'
import { decodeWith, encodeWith, idGenerator } from '@app-template/packages/schema'

import type { MessageFields } from '#chat/domain/message.model'
import { RunNotFoundError } from '#chat/domain/run.error'
import { Run } from '#chat/domain/run.model'
import { RunId } from '#chat/domain/run.util'
import { RunFields } from '#chat/domain/run-fields.model'

/** A Run by id; `userId` limits it to the user's chats, which every api caller passes. */
export type RunWhere = Types.Simplify<
  Pick<Run, 'id'> & Partial<Pick<Run, 'chatId'> & { readonly userId: UserId }>
>

export class RunService extends Context.Service<
  RunService,
  {
    readonly create: (userMessage: MessageFields) => Effect.Effect<Run>
    readonly getOne: (where: RunWhere) => Effect.Effect<Run, RunNotFoundError>
    /**
     * Writes `after`, stamped with the current time, under the status `before` was read in, so a
     * Run another worker moved since dies on the write.
     */
    readonly update: (before: Run, after: Run) => Effect.Effect<Run>
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

    const update = Effect.fn('RunService.update')(function* (before: Run, after: Run) {
      const updatedAt = yield* DateTime.now
      const stamped = new Run({ ...after, updatedAt })
      const row = yield* encodeWith(RunFields)(stamped)

      yield* runs.update(row, { id: before.id, status: [before.status] })
      return stamped
    })

    return { create, getOne, update }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
