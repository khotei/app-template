import { Array as Arr, Context, Crypto, DateTime, Effect, Layer, Ref, Stream, Struct } from 'effect'

import type { UserId } from '@app-template/application/identity'
import { AttachmentRepository, FileRepository } from '@app-template/kernel/data'
import { generateId } from '@app-template/packages/db'

import type { AttachmentBoundError, AttachmentNotFoundError } from '#chat/domain/attachment.error'
import { AttachmentId } from '#chat/domain/attachment.id'
import {
  type Attachment,
  buildAttachment,
  ensureFound,
  ensureUnbound,
  FileSize,
} from '#chat/domain/attachment.model'
import { encodeAttachment } from '#chat/services/attachment.mapper'
import { AttachmentService, type AttachmentWhere } from '#chat/services/attachment.service'
import { LiveAttachmentService } from '#chat/services/live-attachment.service'

export interface AttachmentUpload<E> extends Pick<Attachment, 'mediaType' | 'fileName'> {
  readonly content: Stream.Stream<Uint8Array, E>
}

/** An attachment with its bytes: stored together, read through the live attachments, removed together. */
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
    /** Removes the user's live attachment and its bytes while no message holds it. */
    readonly delete: (
      where: AttachmentWhere,
    ) => Effect.Effect<void, AttachmentNotFoundError | AttachmentBoundError>
  }
>()('@app-template/application/chat/services/FileAttachmentService', {
  make: Effect.gen(function* () {
    const attachments = yield* AttachmentRepository
    const files = yield* FileRepository
    const records = yield* AttachmentService
    const live = yield* LiveAttachmentService
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

    const download = Effect.fn('FileAttachmentService.download')(function* (
      where: AttachmentWhere,
    ) {
      const { id } = yield* live.getOne(where)

      return yield* files
        .selectOne({ id })
        .pipe(Effect.flatMap(ensureFound(id)), Effect.map(Struct.get('url')))
    })

    const remove = Effect.fn('FileAttachmentService.delete')(function* (where: AttachmentWhere) {
      yield* live.getOne(where).pipe(ensureUnbound)
      yield* records.delete(where)
    })

    return { upload, download, delete: remove }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make).pipe(
    Layer.provide([LiveAttachmentService.layer, AttachmentService.layer]),
  )
}
