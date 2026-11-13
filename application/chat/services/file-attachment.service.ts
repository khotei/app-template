import { Array as Arr, Context, Crypto, DateTime, Effect, Layer, Ref, Stream, Struct } from 'effect'

import type { UserId } from '@app-template/application/identity'
import { AttachmentRepository, FileRepository } from '@app-template/kernel/data'
import { generateId } from '@app-template/packages/db'

import type { AttachmentBoundError, AttachmentNotFoundError } from '#chat/domain/attachment.error'
import { AttachmentId } from '#chat/domain/attachment.id'
import {
  type Attachment,
  bindAttachment,
  buildAttachment,
  ensureAllStored,
  ensureFound,
  ensureUnbound,
  FileSize,
} from '#chat/domain/attachment.model'
import type { Message } from '#chat/domain/message.model'
import { encodeAttachment } from '#chat/services/attachment.mapper'
import {
  type AttachmentGetManyWhere,
  AttachmentService,
  type AttachmentWhere,
} from '#chat/services/attachment.service'
import { LiveAttachmentService } from '#chat/services/live-attachment.service'

export interface AttachmentUpload<E> extends Pick<Attachment, 'mediaType' | 'fileName'> {
  readonly content: Stream.Stream<Uint8Array, E>
}

/** An attachment's record and its bytes, stored and removed as one. */
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
     * The user's live attachments whose bytes the store still holds, in creation order; one
     * `AttachmentNotFoundError` names every id that is not.
     */
    readonly getMany: (
      where: AttachmentGetManyWhere,
    ) => Effect.Effect<ReadonlyArray<Attachment>, AttachmentNotFoundError>
    /**
     * Binds the attachments to the stored message and its chat, the bytes first; dies when a
     * send bound one since it was read.
     */
    readonly bind: (
      attachments: ReadonlyArray<Attachment>,
      message: Message,
    ) => Effect.Effect<ReadonlyArray<Attachment>, AttachmentBoundError>
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

    const getMany = Effect.fn('FileAttachmentService.getMany')(function* (
      where: AttachmentGetManyWhere,
    ) {
      const found = yield* live.getMany(where)
      const storedIds = yield* files
        .selectMany({ id: Arr.map(found, Struct.get('id')) })
        .pipe(Effect.map(Arr.map((file) => AttachmentId.make(file.id))))
      return yield* ensureAllStored(where.id, storedIds)(found)
    })

    const bind = Effect.fn('FileAttachmentService.bind')(function* (
      requested: ReadonlyArray<Attachment>,
      message: Message,
    ) {
      const bound = yield* Effect.forEach(requested, (attachment) =>
        bindAttachment(attachment, message),
      )
      // A message without files skips the writes, as the update would die on no rows.
      if (Arr.isReadonlyArrayEmpty(bound)) return bound

      const ids = Arr.map(bound, Struct.get('id'))
      // The files first: unbound bytes expire, so a crash must never leave a bound row over them.
      yield* files.update({ bound: true }, { id: ids })
      // `messageId: null` is the race's guard: a send that bound any of them since the read
      // leaves this write short of a row it names, so it dies and the send rolls back whole.
      yield* attachments.update(
        { messageId: message.id, chatId: message.chatId },
        { id: ids, messageId: null },
      )
      return bound
    })

    const remove = Effect.fn('FileAttachmentService.delete')(function* (where: AttachmentWhere) {
      yield* live.getOne(where).pipe(ensureUnbound)
      // A send that binds it after the check makes this die, so its bytes stay.
      yield* records.delete({ id: [where.id], userId: where.userId, messageId: null })
    })

    return { upload, download, getMany, bind, delete: remove }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make).pipe(
    Layer.provide(LiveAttachmentService.layer),
    Layer.provide(AttachmentService.layer),
  )
}
