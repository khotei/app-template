import { Array as Arr, Context, Crypto, Effect, Layer, Ref, Stream, Struct } from 'effect'

import type { UserId } from '@app-template/application/identity'
import { FileRepository } from '@app-template/kernel/data'
import { generateId } from '@app-template/packages/db'

import { type AttachmentBoundError, AttachmentNotFoundError } from '#chat/domain/attachment.error'
import {
  type Attachment,
  buildBytesId,
  ensureUnbound,
  ensureUnused,
  FileSize,
} from '#chat/domain/attachment.model'
import { AttachmentId } from '#chat/domain/attachment.util'
import {
  type AttachmentGetManyWhere,
  AttachmentService,
  type AttachmentWhere,
} from '#chat/services/attachment.service'

export interface AttachmentUpload<E> extends Pick<Attachment, 'mediaType' | 'fileName'> {
  readonly content: Stream.Stream<Uint8Array, E>
}

/**
 * An attachment's record and its bytes, stored and removed as one; or its bytes alone, once a
 * cascade removed its row.
 */
export class FileAttachmentService extends Context.Service<
  FileAttachmentService,
  {
    /**
     * Stores each file in order, all or none: a failure of the files or of one file's content
     * removes the files already stored.
     */
    readonly upload: <E>(
      userId: UserId,
      uploads: Stream.Stream<AttachmentUpload<E>, E>,
    ) => Effect.Effect<ReadonlyArray<Attachment>, E>
    readonly download: (where: AttachmentWhere) => Effect.Effect<URL, AttachmentNotFoundError>
    /**
     * Removes the bytes held under the user's attachments' own ids, the uploads' among them; a
     * copy's bytes are its source's and stay. Dies while a row of one remains: the bytes go
     * once their rows are gone.
     */
    readonly deleteBytes: (where: AttachmentGetManyWhere) => Effect.Effect<void>
    /**
     * Removes the user's attachment, then its bytes, while no message holds it or a copy sent
     * from it; dies when a send binds it, or adds a copy of it, after the check.
     */
    readonly delete: (
      where: AttachmentWhere,
    ) => Effect.Effect<void, AttachmentNotFoundError | AttachmentBoundError>
  }
>()('@app-template/application/chat/services/FileAttachmentService', {
  make: Effect.gen(function* () {
    const files = yield* FileRepository
    const attachmentService = yield* AttachmentService
    const crypto = yield* Crypto.Crypto
    const randomAttachmentId = generateId(crypto, AttachmentId.make)

    const uploadFile = Effect.fnUntraced(function* <E>(
      file: AttachmentUpload<E>,
      { id, userId }: { readonly id: AttachmentId; readonly userId: UserId },
    ) {
      const size = yield* files.insert({ ...file, id }).pipe(Effect.map(FileSize.make))
      return yield* attachmentService.create({ ...file, id, userId, size })
    })

    const upload = Effect.fn('FileAttachmentService.upload')(function* <E>(
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
        if (Arr.isReadonlyArrayNonEmpty(storedIds)) {
          yield* attachmentService.delete({ id: storedIds, userId })
        }
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

    const download = Effect.fn('FileAttachmentService.download')(function* (
      where: AttachmentWhere,
    ) {
      const attachment = yield* attachmentService.getOne(where)
      return yield* files
        .selectOne({ id: buildBytesId(attachment) })
        .pipe(
          Effect.flatMap(
            Effect.fromOption(() => new AttachmentNotFoundError({ ids: [attachment.id] })),
          ),
          Effect.map(Struct.get('url')),
        )
    })

    const remove = Effect.fn('FileAttachmentService.delete')(function* (where: AttachmentWhere) {
      const uses = yield* attachmentService.getMany({ userId: where.userId, sourceId: where.id })

      yield* attachmentService.getOne(where).pipe(ensureUnbound, Effect.flatMap(ensureUnused(uses)))
      // A send that binds it after the check makes the rows' delete die, so its bytes stay.
      yield* attachmentService.delete({ id: [where.id], userId: where.userId, messageId: null })
      yield* files.delete({ id: [where.id] })
    })

    // By the ids given, never by `buildBytesId`: a copy's bytes are its source's, and stay in
    // the library.
    const deleteBytes = Effect.fn('FileAttachmentService.deleteBytes')(function* (
      where: AttachmentGetManyWhere,
    ) {
      // A row left would name bytes no longer stored.
      yield* attachmentService
        .getMany(where)
        .pipe(
          Effect.filterOrElse(Arr.isReadonlyArrayEmpty, () =>
            Effect.die('the bytes of an attachment whose row remains'),
          ),
        )
      yield* files.delete({ id: where.id })
    })

    return { upload, download, deleteBytes, delete: remove }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
