import { Array as Arr, Context, Effect, Layer, type Types } from 'effect'

import { AttachmentRepository, FileRepository } from '@app-template/kernel/data'

import type { AttachmentNotFoundError } from '#chat/domain/attachment.error'
import { type Attachment, ensureFound } from '#chat/domain/attachment.model'
import { decodeAttachment, decodeAttachments } from '#chat/services/attachment.mapper'

/** The user's attachment; another user's reads as absent. */
export type AttachmentWhere = Types.Simplify<Pick<Attachment, 'id' | 'userId'>>

/** The user's attachments by id; another user's id reads as absent. */
export type AttachmentGetManyWhere = Types.Simplify<
  { readonly id: ReadonlyArray<Attachment['id']> } & Pick<Attachment, 'userId'>
>

/** The user's attachments by id; `messageId: null` deletes them only while unbound, else bound or not. */
export type AttachmentDeleteWhere = Types.Simplify<
  AttachmentGetManyWhere & { readonly messageId?: null }
>

/** The attachments' records as stored, expired ones included; `LiveAttachmentService` drops those. */
export class AttachmentService extends Context.Service<
  AttachmentService,
  {
    readonly getOne: (where: AttachmentWhere) => Effect.Effect<Attachment, AttachmentNotFoundError>
    /** The user's attachments among `where.id` in creation order; an absent id is left out. */
    readonly getMany: (where: AttachmentGetManyWhere) => Effect.Effect<ReadonlyArray<Attachment>>
    /**
     * Removes the user's attachments, then their bytes; dies unless a row matches each id. A miss
     * leaves the rows it matched deleted and all the bytes in place, unless the caller's
     * transaction rolls the rows back.
     */
    readonly delete: (where: AttachmentDeleteWhere) => Effect.Effect<void>
  }
>()('@app-template/application/chat/services/AttachmentService', {
  make: Effect.gen(function* () {
    const attachments = yield* AttachmentRepository
    const files = yield* FileRepository

    const getOne = Effect.fn('AttachmentService.getOne')((where: AttachmentWhere) =>
      attachments
        .selectOne(where)
        .pipe(Effect.flatMap(decodeAttachment), Effect.flatMap(ensureFound(where.id))),
    )

    const getMany = Effect.fn('AttachmentService.getMany')(function* (
      where: AttachmentGetManyWhere,
    ) {
      if (Arr.isReadonlyArrayEmpty(where.id)) return Arr.empty<Attachment>()
      return yield* attachments.selectMany(where).pipe(Effect.flatMap(decodeAttachments))
    })

    const remove = Effect.fn('AttachmentService.delete')(function* (where: AttachmentDeleteWhere) {
      if (Arr.isReadonlyArrayEmpty(where.id)) return
      yield* attachments.delete(where)
      yield* files.delete({ id: where.id })
    })

    return { getOne, getMany, delete: remove }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
