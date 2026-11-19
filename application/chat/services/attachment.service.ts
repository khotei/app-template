import {
  Array as Arr,
  Context,
  Crypto,
  DateTime,
  Effect,
  Filter,
  Layer,
  Schema,
  Struct,
  type Types,
} from 'effect'

import type { UserId } from '@app-template/application/identity'
import { AttachmentRepository } from '@app-template/kernel/data'
import { decodeRowWith, encodeRowWith, generateId } from '@app-template/packages/db'

import type { AttachmentBoundError, AttachmentNotFoundError } from '#chat/domain/attachment.error'
import { AttachmentId } from '#chat/domain/attachment.id'
import {
  Attachment,
  bindAttachment,
  buildAttachment,
  buildAttachmentFrom,
  ensureFound,
  isInLibrary,
} from '#chat/domain/attachment.model'
import type { Message } from '#chat/domain/message.model'

/** The user's attachment; another user's reads as absent. */
export type AttachmentWhere = Types.Simplify<Pick<Attachment, 'id' | 'userId'>>

/** The user's attachments by id; another user's id reads as absent. */
export type AttachmentGetManyWhere = Types.Simplify<
  { readonly id: ReadonlyArray<Attachment['id']> } & Pick<Attachment, 'userId'>
>

/** The user's records sent from the attachment `sourceId`; another user's read as absent. */
export type AttachmentSentWhere = Types.Simplify<
  { readonly sourceId: Attachment['id'] } & Pick<Attachment, 'userId'>
>

/** The user's attachments by id; `messageId: null` deletes them only while unbound, else bound or not. */
export type AttachmentDeleteWhere = Types.Simplify<
  Pick<Attachment, 'userId'> & {
    readonly id: Arr.NonEmptyReadonlyArray<Attachment['id']>
    readonly messageId?: null
  }
>

/** An attachment's records as stored, whether or not the store still holds their bytes. */
export class AttachmentService extends Context.Service<
  AttachmentService,
  {
    /** Stores the record of a library attachment whose bytes are stored under `fields.id`. */
    readonly create: (
      fields: Pick<Attachment, 'id' | 'userId' | 'fileName' | 'mediaType' | 'size'>,
    ) => Effect.Effect<Attachment>
    /** The user's library, the attachments no chat holds, in upload order. */
    readonly list: (userId: UserId) => Effect.Effect<ReadonlyArray<Attachment>>
    /** The record as stored, whether or not the store still holds its bytes. */
    readonly getOne: (where: AttachmentWhere) => Effect.Effect<Attachment, AttachmentNotFoundError>
    /**
     * The user's attachments among `where.id`, or the records sent from `where.sourceId`, in
     * creation order; an absent id is left out.
     */
    readonly getMany: (
      where: AttachmentGetManyWhere | AttachmentSentWhere,
    ) => Effect.Effect<ReadonlyArray<Attachment>>
    /**
     * Binds the chat's attachments to the stored message and adds the chat's record of each
     * library attachment, which stays in the library; dies when a send bound one, or a delete
     * removed a library one, since it was read.
     */
    readonly bind: (
      attachments: ReadonlyArray<Attachment>,
      message: Pick<Message, 'id' | 'chatId'>,
    ) => Effect.Effect<ReadonlyArray<Attachment>, AttachmentBoundError>
    /**
     * Removes the user's attachments' rows; dies unless a row matches each id. A miss leaves the
     * rows it matched deleted, unless the caller's transaction rolls them back.
     */
    readonly delete: (where: AttachmentDeleteWhere) => Effect.Effect<void>
  }
>()('@app-template/application/chat/services/AttachmentService', {
  make: Effect.gen(function* () {
    const attachments = yield* AttachmentRepository
    const crypto = yield* Crypto.Crypto
    const randomAttachmentId = generateId(crypto, AttachmentId.make)

    const insert = (attachment: Attachment) =>
      encodeRowWith(Attachment)(attachment).pipe(Effect.flatMap(attachments.insert))

    const create = Effect.fn('AttachmentService.create')(function* (
      fields: Pick<Attachment, 'id' | 'userId' | 'fileName' | 'mediaType' | 'size'>,
    ) {
      const createdAt = yield* DateTime.now
      const attachment = buildAttachment({ ...fields, createdAt })

      yield* insert(attachment)
      return attachment
    })

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
      where: AttachmentGetManyWhere | AttachmentSentWhere,
    ) {
      if ('id' in where && Arr.isReadonlyArrayEmpty(where.id)) return Arr.empty<Attachment>()
      return yield* attachments
        .selectMany(where)
        .pipe(Effect.flatMap(decodeRowWith(Schema.Array(Attachment))))
    })

    const bind = Effect.fn('AttachmentService.bind')(function* (
      requested: ReadonlyArray<Attachment>,
      message: Pick<Message, 'id' | 'chatId'>,
    ) {
      const createdAt = yield* DateTime.now
      const [sources, held] = Arr.partition(requested, Filter.fromPredicate(isInLibrary))
      const bound = yield* Effect.forEach(held, (attachment) => bindAttachment(attachment, message))
      const records = yield* Effect.forEach(sources, (source) =>
        randomAttachmentId.pipe(
          Effect.map((id) => buildAttachmentFrom(source, { id, message, createdAt })),
        ),
      )

      // `messageId: null` is the race's guard: a send that bound any of them since the read
      // leaves this write short of a row it names, so it dies and the send rolls back whole.
      // No row to bind skips the write, which would die on none.
      if (Arr.isReadonlyArrayNonEmpty(bound)) {
        yield* attachments.update(
          { messageId: message.id, chatId: message.chatId },
          { id: Arr.map(bound, Struct.get('id')), messageId: null },
        )
      }
      yield* Effect.forEach(records, insert, { discard: true })
      return Arr.appendAll(bound, records)
    })

    const remove = Effect.fn('AttachmentService.delete')(attachments.delete)

    return { create, list, getOne, getMany, bind, delete: remove }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
