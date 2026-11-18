import {
  Array as Arr,
  Context,
  Crypto,
  DateTime,
  Effect,
  Layer,
  Predicate,
  Ref,
  Schema,
  Stream,
  Struct,
  type Types,
} from 'effect'

import type { UserId } from '@app-template/application/identity'
import { AttachmentRepository, FileRepository } from '@app-template/kernel/data'
import { decodeRowWith, encodeRowWith, generateId } from '@app-template/packages/db'

import type { AttachmentBoundError, AttachmentNotFoundError } from '#chat/domain/attachment.error'
import { AttachmentId } from '#chat/domain/attachment.id'
import {
  Attachment,
  bindAttachment,
  buildAttachment,
  buildAttachmentFrom,
  buildFileId,
  ensureAllStored,
  ensureFound,
  ensureUnbound,
  ensureUnused,
  FileSize,
  isInLibrary,
} from '#chat/domain/attachment.model'
import type { Message } from '#chat/domain/message.model'

/** The user's attachment; another user's reads as absent. */
export type AttachmentWhere = Types.Simplify<Pick<Attachment, 'id' | 'userId'>>

/** The user's attachments by id; another user's id reads as absent. */
export type AttachmentGetManyWhere = Types.Simplify<
  { readonly id: ReadonlyArray<Attachment['id']> } & Pick<Attachment, 'userId'>
>

export interface AttachmentUpload<E> extends Pick<Attachment, 'mediaType' | 'fileName'> {
  readonly content: Stream.Stream<Uint8Array, E>
}

/** An attachment's record and its bytes, stored and removed as one. */
export class AttachmentService extends Context.Service<
  AttachmentService,
  {
    /**
     * Stores each file in order, all or none: a failure of the files or of one file's content
     * removes the files already stored.
     */
    readonly upload: <E>(
      userId: UserId,
      uploads: Stream.Stream<AttachmentUpload<E>, E>,
    ) => Effect.Effect<ReadonlyArray<Attachment>, E>
    /** The user's library, the attachments no chat holds, in upload order. */
    readonly list: (userId: UserId) => Effect.Effect<ReadonlyArray<Attachment>>
    /** The record as stored, whether or not the store still holds its bytes. */
    readonly getOne: (where: AttachmentWhere) => Effect.Effect<Attachment, AttachmentNotFoundError>
    readonly download: (where: AttachmentWhere) => Effect.Effect<URL, AttachmentNotFoundError>
    /**
     * The user's attachments whose bytes the store still holds, in creation order; one
     * `AttachmentNotFoundError` names every id that is not.
     */
    readonly getMany: (
      where: AttachmentGetManyWhere,
    ) => Effect.Effect<ReadonlyArray<Attachment>, AttachmentNotFoundError>
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
     * Removes the user's attachment and its bytes while no message holds it or a record sent
     * from it; dies when a send binds it, or adds a record of it, after the check.
     */
    readonly delete: (
      where: AttachmentWhere,
    ) => Effect.Effect<void, AttachmentNotFoundError | AttachmentBoundError>
  }
>()('@app-template/application/chat/services/AttachmentService', {
  make: Effect.gen(function* () {
    const attachments = yield* AttachmentRepository
    const files = yield* FileRepository
    const crypto = yield* Crypto.Crypto
    const randomAttachmentId = generateId(crypto, AttachmentId.make)

    const uploadFile = Effect.fnUntraced(function* <E>(
      file: AttachmentUpload<E>,
      { id, userId }: { readonly id: AttachmentId; readonly userId: UserId },
    ) {
      const createdAt = yield* DateTime.now

      const size = yield* files.insert({ ...file, id }).pipe(Effect.map(FileSize.make))
      const attachment = buildAttachment({ ...file, id, userId, size, createdAt })
      const row = yield* encodeRowWith(Attachment)(attachment)

      yield* attachments.insert(row)
      return attachment
    })

    const upload = Effect.fn('AttachmentService.upload')(function* <E>(
      userId: UserId,
      uploads: Stream.Stream<AttachmentUpload<E>, E>,
    ) {
      // Bytes are tracked before the write, rows after the insert: a lost record still deletes
      // its bytes, and the cleanup deletes only rows that exist.
      const tracked = yield* Ref.make<ReadonlyArray<AttachmentId>>(Arr.empty())
      const stored = yield* Ref.make<ReadonlyArray<AttachmentId>>(Arr.empty())
      const trackId = randomAttachmentId.pipe(
        Effect.tap((id) => Ref.update(tracked, Arr.append(id))),
      )
      const storeId = (attachment: Attachment) => Ref.update(stored, Arr.append(attachment.id))
      const deleteTracked = Effect.gen(function* () {
        const storedIds = yield* Ref.get(stored)
        if (Arr.isReadonlyArrayNonEmpty(storedIds)) yield* attachments.delete({ id: storedIds })
        const trackedIds = yield* Ref.get(tracked)
        yield* files.delete({ id: trackedIds })
      })

      return yield* uploads.pipe(
        Stream.mapEffect((file) =>
          trackId.pipe(
            Effect.flatMap((id) => uploadFile(file, { id, userId })),
            Effect.tap(storeId),
          ),
        ),
        Stream.runCollect,
        Effect.onError(() => deleteTracked),
      )
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

    const download = Effect.fn('AttachmentService.download')(function* (where: AttachmentWhere) {
      const attachment = yield* getOne(where)
      return yield* files
        .selectOne({ id: buildFileId(attachment) })
        .pipe(Effect.flatMap(ensureFound(attachment.id)), Effect.map(Struct.get('url')))
    })

    const getMany = Effect.fn('AttachmentService.getMany')(function* (
      where: AttachmentGetManyWhere,
    ) {
      if (Arr.isReadonlyArrayEmpty(where.id)) return Arr.empty<Attachment>()
      const found = yield* attachments
        .selectMany(where)
        .pipe(Effect.flatMap(decodeRowWith(Schema.Array(Attachment))))
      const storedIds = yield* files
        .selectMany({ id: Arr.map(found, buildFileId) })
        .pipe(Effect.map(Arr.map((file) => AttachmentId.make(file.id))))
      return yield* ensureAllStored(where.id, storedIds)(found)
    })

    const bind = Effect.fn('AttachmentService.bind')(function* (
      requested: ReadonlyArray<Attachment>,
      message: Pick<Message, 'id' | 'chatId'>,
    ) {
      const createdAt = yield* DateTime.now
      const held = Arr.filter(requested, Predicate.not(isInLibrary))
      const sources = Arr.filter(requested, isInLibrary)
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
      yield* Effect.forEach(
        records,
        (record) => encodeRowWith(Attachment)(record).pipe(Effect.flatMap(attachments.insert)),
        { discard: true },
      )
      return Arr.appendAll(bound, records)
    })

    const remove = Effect.fn('AttachmentService.delete')(function* (where: AttachmentWhere) {
      const uses = yield* attachments
        .selectMany({ userId: where.userId, sourceId: where.id })
        .pipe(Effect.flatMap(decodeRowWith(Schema.Array(Attachment))))

      yield* getOne(where).pipe(ensureUnbound, Effect.flatMap(ensureUnused(uses)))
      // A send that binds it after the check makes this die, so its bytes stay.
      yield* attachments.delete({ id: [where.id], userId: where.userId, messageId: null })
      yield* files.delete({ id: [where.id] })
    })

    return { upload, list, getOne, download, getMany, bind, delete: remove }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
