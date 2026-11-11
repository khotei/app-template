import { Context, Crypto, DateTime, Effect, Layer, type Types } from 'effect'

import type { UserId } from '@app-template/application/identity'
import { RunRepository } from '@app-template/kernel/data'
import { generateId } from '@app-template/packages/db'

import { CurrentReplyProvenance } from '#chat/domain/assistant.port'
import { RunId } from '#chat/domain/chat.id'
import type { Message } from '#chat/domain/message.model'
import { RunNotFoundError } from '#chat/domain/run.error'
import { buildRun, type Run } from '#chat/domain/run.model'
import { decodeRun, encodeRun } from '#chat/services/run.mapper'

/** The Run of the user's chat; one of another user's chat reads as absent. */
export type RunWhere = Types.Simplify<Pick<Run, 'id' | 'chatId'> & { readonly userId: UserId }>

export class RunService extends Context.Service<
  RunService,
  {
    /**
     * Stores the queued Run that answers the user's message, with this process's provenance;
     * dies when its chat has an active Run already, a send that lost the race to another.
     */
    readonly create: (userMessage: Message) => Effect.Effect<Run>
    readonly getOne: (where: RunWhere) => Effect.Effect<Run, RunNotFoundError>
  }
>()('@app-template/application/chat/services/RunService', {
  make: Effect.gen(function* () {
    const runs = yield* RunRepository
    const crypto = yield* Crypto.Crypto
    const provenance = yield* CurrentReplyProvenance

    const create = Effect.fn('RunService.create')(function* (userMessage: Message) {
      const id = yield* generateId(crypto, RunId.make)
      const createdAt = yield* DateTime.now
      const run = buildRun({ id, chatId: userMessage.chatId, userMessage, provenance, createdAt })
      const row = yield* encodeRun(run)

      // The index on the active Run refuses a second one in the chat, so this insert dies.
      yield* runs.insert(row)
      return run
    })

    const getOne = Effect.fn('RunService.getOne')((where: RunWhere) =>
      runs
        .selectOne(where)
        .pipe(
          Effect.flatMap(decodeRun),
          Effect.flatMap(Effect.fromOption(() => new RunNotFoundError({ id: where.id }))),
        ),
    )

    return { create, getOne }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
