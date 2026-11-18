import { Array as Arr, Context, Effect, Layer, Schema, type Types } from 'effect'

import type { UserId } from '@app-template/application/identity'
import { AttachmentRepository, FileRepository } from '@app-template/kernel/data'
import { decodeRowWith } from '@app-template/packages/db'

import type { AttachmentNotFoundError } from '#chat/domain/attachment.error'
import { Attachment, ensureFound } from '#chat/domain/attachment.model'

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

export class AttachmentService extends Context.Service<
  AttachmentService,
  {
    /** The user's library, the attachments no chat holds, in upload order. */
    readonly list: (userId: UserId) => Effect.Effect<ReadonlyArray<Attachment>>
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

    const list = Effect.fn('AttachmentService.list')((userId: UserId) =>
      attachments
        .selectMany({ userId, chatId: null })
        .pipe(Effect.flatMap(decodeRowWith(Schema.Array(Attachment)))),
    )

    const getOne = Effect.fn('AttachmentService.getOne')((where: AttachmentWhere) =>
      attachments
        .selectOne(where)
        .pipe(
          Effect.flatMap(decodeRowWith(Schema.Option(Attachment))),
          Effect.flatMap(ensureFound(where.id)),
        ),
    )

    const getMany = Effect.fn('AttachmentService.getMany')(function* (
      where: AttachmentGetManyWhere,
    ) {
      if (Arr.isReadonlyArrayEmpty(where.id)) return Arr.empty<Attachment>()
      return yield* attachments
        .selectMany(where)
        .pipe(Effect.flatMap(decodeRowWith(Schema.Array(Attachment))))
    })

    const remove = Effect.fn('AttachmentService.delete')(function* (where: AttachmentDeleteWhere) {
      if (Arr.isReadonlyArrayEmpty(where.id)) return
      yield* attachments.delete(where)
      yield* files.delete({ id: where.id })
    })

    return { list, getOne, getMany, delete: remove }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
