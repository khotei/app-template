import {
  Array as Arr,
  Context,
  Crypto,
  DateTime,
  Effect,
  Layer,
  Ref,
  Stream,
  type Types,
} from 'effect'

import type { UserId } from '@app-template/application/identity'
import { AttachmentRepository, FileRepository } from '@app-template/kernel/data'
import { generateId } from '@app-template/packages/db'

import type { AttachmentBoundError, AttachmentNotFoundError } from '#chat/domain/attachment.error'
import { AttachmentId } from '#chat/domain/attachment.id'
import {
  type Attachment,
  buildAttachment,
  ensureAllLive,
  ensureFound,
  ensureLive,
  ensureUnbound,
  FileSize,
} from '#chat/domain/attachment.model'
import {
  decodeAttachment,
  decodeAttachments,
  encodeAttachment,
} from '#chat/services/attachment.mapper'

export interface AttachmentUpload<E> extends Pick<Attachment, 'mediaType' | 'fileName'> {
  readonly content: Stream.Stream<Uint8Array, E>
}

/** The user's attachment; another user's reads as absent. */
export type AttachmentWhere = Types.Simplify<Pick<Attachment, 'id' | 'userId'>>

/** The user's attachments by id; an absent, expired or another user's id fails the read. */
export type AttachmentGetManyWhere = Types.Simplify<
  { readonly id: ReadonlyArray<Attachment['id']> } & Pick<Attachment, 'userId'>
>

/** An attachment unbound for `unboundLifetime` reads as not found; no read deletes it. */
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
    readonly getOne: (where: AttachmentWhere) => Effect.Effect<Attachment, AttachmentNotFoundError>
    readonly download: (where: AttachmentWhere) => Effect.Effect<URL, AttachmentNotFoundError>
    /** Removes the user's attachment while no message holds it. */
    readonly delete: (
      where: AttachmentWhere,
    ) => Effect.Effect<void, AttachmentNotFoundError | AttachmentBoundError>
    /**
     * The user's attachments in creation order; one `AttachmentNotFoundError` names every absent,
     * expired or another user's id, in the order asked.
     */
    readonly getMany: (
      where: AttachmentGetManyWhere,
    ) => Effect.Effect<ReadonlyArray<Attachment>, AttachmentNotFoundError>
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
      const row = yield* encodeAttachment(attachment)

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

    const getOne = Effect.fn('AttachmentService.getOne')(function* (where: AttachmentWhere) {
      const found = yield* attachments.selectOne(where).pipe(Effect.flatMap(decodeAttachment))
      const now = yield* DateTime.now

      return yield* found.pipe(ensureLive(where.id, now))
    })

    const download = Effect.fn('AttachmentService.download')(function* (where: AttachmentWhere) {
      const { id } = yield* getOne(where)

      return yield* files.url({ id }).pipe(Effect.flatMap(ensureFound(id)))
    })

    const remove = Effect.fn('AttachmentService.delete')(function* (where: AttachmentWhere) {
      const { id } = yield* getOne(where).pipe(ensureUnbound)

      // A send that binds it after the check makes this die, so its bytes stay.
      yield* attachments.delete({ id: [id], messageId: null })
      yield* files.delete({ id: [id] })
    })

    const getMany = Effect.fn('AttachmentService.getMany')(function* (
      where: AttachmentGetManyWhere,
    ) {
      if (Arr.isReadonlyArrayEmpty(where.id)) return Arr.empty<Attachment>()
      const now = yield* DateTime.now

      return yield* attachments
        .selectMany(where)
        .pipe(Effect.flatMap(decodeAttachments), Effect.flatMap(ensureAllLive(where.id, now)))
    })

    return { upload, getOne, download, delete: remove, getMany }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
