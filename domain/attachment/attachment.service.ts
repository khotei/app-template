import {
  Array as Arr,
  Context,
  Crypto,
  DateTime,
  Effect,
  HashMap,
  Layer,
  Option,
  Predicate,
  Ref,
  Stream,
  Struct,
} from 'effect'

import {
  type AttachmentBoundError,
  AttachmentNotFoundError,
} from '#domain/attachment/attachment.error'
import { AttachmentId } from '#domain/attachment/attachment.id'
import {
  Attachment,
  type AttachmentDownload,
  type AttachmentMeta,
  buildAttachment,
  ensureUnbound,
  isExpiredAt,
} from '#domain/attachment/attachment.model'
import { AttachmentBucket, AttachmentRepository } from '#domain/attachment/attachment.port'
import type { ChatId, MessageId } from '#domain/chat/chat.id'
import { generateId } from '#domain/shared/id'
import type { UserId } from '#domain/user/user.id'

export interface AttachmentUpload<E> extends AttachmentMeta {
  readonly content: Stream.Stream<Uint8Array, E>
}

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
      files: Stream.Stream<AttachmentUpload<E>, E>,
    ) => Effect.Effect<ReadonlyArray<Attachment>, E>
    readonly get: (
      userId: UserId,
      id: AttachmentId,
    ) => Effect.Effect<Attachment, AttachmentNotFoundError>
    readonly download: (
      userId: UserId,
      id: AttachmentId,
    ) => Effect.Effect<AttachmentDownload, AttachmentNotFoundError>
    /** Removes the user's attachment while no message holds it. */
    readonly delete: (
      userId: UserId,
      id: AttachmentId,
    ) => Effect.Effect<void, AttachmentNotFoundError | AttachmentBoundError>
    /**
     * Binds the user's attachments to the message of the chat and returns them bound, in the order
     * asked; checks them under their rows' lock, so of two sends binding one file the second waits
     * and fails `AttachmentBoundError`.
     */
    readonly bind: (
      userId: UserId,
      ids: ReadonlyArray<AttachmentId>,
      to: { readonly messageId: MessageId; readonly chatId: ChatId },
    ) => Effect.Effect<ReadonlyArray<Attachment>, AttachmentNotFoundError | AttachmentBoundError>
  }
>()('@app-template/domain/attachment/AttachmentService', {
  make: Effect.gen(function* () {
    const attachments = yield* AttachmentRepository
    const bucket = yield* AttachmentBucket
    const crypto = yield* Crypto.Crypto
    const randomAttachmentId = generateId(crypto, AttachmentId.make)

    const uploadFile = Effect.fnUntraced(function* <E>(
      file: AttachmentUpload<E>,
      { id, userId }: { readonly id: AttachmentId; readonly userId: UserId },
    ) {
      const createdAt = yield* DateTime.now

      const meta = Struct.pick(file, ['mediaType', 'fileName'])
      const size = yield* bucket.insert(id, file.content, meta)
      const attachment = buildAttachment({ ...meta, id, userId, size, createdAt })

      yield* attachments.insert(attachment)
      return attachment
    })

    const upload = Effect.fn('AttachmentService.upload')(function* <E>(
      userId: UserId,
      files: Stream.Stream<AttachmentUpload<E>, E>,
    ) {
      // Bytes are tracked before the write, rows after the insert: a lost record still deletes
      // its bytes, and the cleanup deletes only rows that exist.
      const tracked = yield* Ref.make<ReadonlyArray<AttachmentId>>(Arr.empty())
      const stored = yield* Ref.make<ReadonlyArray<AttachmentId>>(Arr.empty())
      const trackId = Effect.tap(randomAttachmentId, (id) => Ref.update(tracked, Arr.append(id)))
      const storeId = (attachment: Attachment) => Ref.update(stored, Arr.append(attachment.id))
      const deleteTracked = Effect.gen(function* () {
        const storedIds = yield* Ref.get(stored)
        if (Arr.isReadonlyArrayNonEmpty(storedIds)) yield* attachments.delete({ id: storedIds })
        const trackedIds = yield* Ref.get(tracked)
        yield* bucket.delete(trackedIds)
      })

      return yield* files.pipe(
        Stream.mapEffect((file) =>
          Effect.flatMap(trackId, (id) =>
            uploadFile(file, { id, userId }).pipe(Effect.tap(storeId)),
          ),
        ),
        Stream.runCollect,
        Effect.onError(() => deleteTracked),
      )
    })

    const get = Effect.fn('AttachmentService.get')(function* (userId: UserId, id: AttachmentId) {
      const found = yield* attachments.selectOne({ id, userId })
      const now = yield* DateTime.now

      return yield* found.pipe(
        Option.filter(Predicate.not(isExpiredAt(now))),
        Effect.fromOption(() => new AttachmentNotFoundError({ id })),
      )
    })

    const download = Effect.fn('AttachmentService.download')(function* (
      userId: UserId,
      id: AttachmentId,
    ) {
      const attachment = yield* get(userId, id)
      const url = yield* bucket
        .url(id)
        .pipe(Effect.flatMap(Effect.fromOption(() => new AttachmentNotFoundError({ id }))))

      return { attachment, url }
    })

    const remove = Effect.fn('AttachmentService.delete')(function* (
      userId: UserId,
      id: AttachmentId,
    ) {
      const attachment = yield* get(userId, id)
      yield* ensureUnbound(attachment)

      yield* attachments.delete({ id: [id] })
      yield* bucket.delete([id])
    })

    // One batch read; the refusal still names the first bad id in the order asked.
    const bind = Effect.fn('AttachmentService.bind')(function* (
      userId: UserId,
      ids: ReadonlyArray<AttachmentId>,
      { messageId, chatId }: { readonly messageId: MessageId; readonly chatId: ChatId },
    ) {
      // A send without files binds nothing, and the update below dies on no rows.
      if (Arr.isReadonlyArrayEmpty(ids)) return []
      // The rows stay locked until the send commits, so a concurrent bind of one of them waits
      // here and then finds it bound.
      const stored = yield* attachments.selectMany({ id: ids, userId }, { forUpdate: true })
      const now = yield* DateTime.now
      const found = HashMap.fromIterable(
        Arr.map(stored, (attachment) => [attachment.id, attachment]),
      )
      const ensureBindable = (id: AttachmentId) =>
        HashMap.get(found, id).pipe(
          Option.filter(Predicate.not(isExpiredAt(now))),
          Effect.fromOption(() => new AttachmentNotFoundError({ id })),
          Effect.flatMap(ensureUnbound),
        )

      const checked = yield* Effect.forEach(ids, ensureBindable)

      const binding = { messageId: Option.some(messageId), chatId: Option.some(chatId) }
      // Keep first: unbound bytes expire, so a crash must never leave a bound row over them.
      yield* Effect.forEach(ids, bucket.keep, { discard: true })
      yield* attachments.update(binding, { id: ids, userId, messageId: Option.none() })
      return Arr.map(checked, (attachment) => new Attachment({ ...attachment, ...binding }))
    })

    return { upload, get, download, delete: remove, bind }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
