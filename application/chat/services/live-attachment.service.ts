import { Context, DateTime, Effect, Layer } from 'effect'

import type { AttachmentNotFoundError } from '#chat/domain/attachment.error'
import { type Attachment, ensureAllLive, ensureLive } from '#chat/domain/attachment.model'
import {
  type AttachmentGetManyWhere,
  AttachmentService,
  type AttachmentWhere,
} from '#chat/services/attachment.service'

/** The attachments a caller may still use: one unbound for `unboundLifetime` reads as not found. */
export class LiveAttachmentService extends Context.Service<
  LiveAttachmentService,
  {
    readonly getOne: (where: AttachmentWhere) => Effect.Effect<Attachment, AttachmentNotFoundError>
    /**
     * The user's attachments in creation order; one `AttachmentNotFoundError` names every absent,
     * expired or another user's id, in the order asked.
     */
    readonly getMany: (
      where: AttachmentGetManyWhere,
    ) => Effect.Effect<ReadonlyArray<Attachment>, AttachmentNotFoundError>
  }
>()('@app-template/application/chat/services/LiveAttachmentService', {
  make: Effect.gen(function* () {
    const attachments = yield* AttachmentService

    const getOne = Effect.fn('LiveAttachmentService.getOne')(function* (where: AttachmentWhere) {
      const now = yield* DateTime.now
      return yield* attachments.getOne(where).pipe(ensureLive(now))
    })

    const getMany = Effect.fn('LiveAttachmentService.getMany')(function* (
      where: AttachmentGetManyWhere,
    ) {
      const now = yield* DateTime.now
      return yield* attachments.getMany(where).pipe(Effect.flatMap(ensureAllLive(where.id, now)))
    })

    return { getOne, getMany }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make).pipe(Layer.provide(AttachmentService.layer))
}
