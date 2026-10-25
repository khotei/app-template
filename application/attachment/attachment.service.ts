import {
  Array as Arr,
  Context,
  Crypto,
  DateTime,
  Effect,
  Layer,
  Option,
  Ref,
  Stream,
  Struct,
} from 'effect'

import {
  type Attachment,
  AttachmentBoundError,
  type AttachmentDownload,
  AttachmentId,
  type AttachmentMeta,
  AttachmentNotFoundError,
  AttachmentRepository,
  AttachmentStore,
  buildAttachment,
  ensureBindable,
  isVisibleTo,
} from '@app-template/domain/attachment'
import type { MessageId } from '@app-template/domain/chat'
import { ensureFound } from '@app-template/domain/shared'
import type { UserId } from '@app-template/domain/user'

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
     * Binds the user's attachments to the message and returns them bound, in the order asked; an
     * id another bind took since the check fails `AttachmentBoundError`, the others staying bound
     * unless the caller's transaction rolls back.
     */
    readonly bind: (
      userId: UserId,
      ids: ReadonlyArray<AttachmentId>,
      messageId: MessageId,
    ) => Effect.Effect<ReadonlyArray<Attachment>, AttachmentNotFoundError | AttachmentBoundError>
    /**
     * Removes these attachments, bound or not; an id already removed is skipped, so a retried
     * cascade finishes.
     *
     * A step of `DeleteChatUseCase`, which found the ids through the user's chat: it checks no
     * owner, and entry points call the use case, never this.
     */
    readonly deleteByIds: (ids: ReadonlyArray<AttachmentId>) => Effect.Effect<void>
  }
>()('@app-template/application/attachment/AttachmentService', {
  make: Effect.gen(function* () {
    const attachments = yield* AttachmentRepository
    const store = yield* AttachmentStore
    const crypto = yield* Crypto.Crypto
    const randomUuid = Effect.orDie(crypto.randomUUIDv7())
    const randomAttachmentId = Effect.map(randomUuid, AttachmentId.make)

    const deleteByIds = Effect.fn('AttachmentService.deleteByIds')(function* (
      ids: ReadonlyArray<AttachmentId>,
    ) {
      yield* attachments.deleteByIds(ids)
      yield* Effect.forEach(ids, store.delete, { discard: true })
    })

    const uploadFile = Effect.fnUntraced(function* <E>(
      file: AttachmentUpload<E>,
      { id, userId }: { readonly id: AttachmentId; readonly userId: UserId },
    ) {
      const createdAt = yield* DateTime.now

      const meta = Struct.pick(file, ['mediaType', 'fileName'])
      const size = yield* store.insert(id, file.content, meta)
      const attachment = buildAttachment({ ...meta, id, userId, size, createdAt })

      yield* attachments.insert(attachment)
      return attachment
    })

    const upload = Effect.fn('AttachmentService.upload')(function* <E>(
      userId: UserId,
      files: Stream.Stream<AttachmentUpload<E>, E>,
    ) {
      const tracked = yield* Ref.make(Arr.empty<AttachmentId>())
      // Tracked before the write, not after the insert: a lost record still deletes the bytes.
      const trackId = Effect.tap(randomAttachmentId, (id) => Ref.update(tracked, Arr.append(id)))
      const deleteTracked = Effect.flatMap(Ref.get(tracked), deleteByIds)

      return yield* files.pipe(
        Stream.mapEffect((file) =>
          Effect.flatMap(trackId, (id) => uploadFile(file, { id, userId })),
        ),
        Stream.runCollect,
        Effect.onError(() => deleteTracked),
      )
    })

    const get = Effect.fn('AttachmentService.get')(function* (userId: UserId, id: AttachmentId) {
      const found = yield* attachments.selectById(id)
      const now = yield* DateTime.now

      return yield* ensureFound(
        found,
        isVisibleTo(userId, now),
        () => new AttachmentNotFoundError({ id }),
      )
    })

    const download = Effect.fn('AttachmentService.download')(function* (
      userId: UserId,
      id: AttachmentId,
    ) {
      const attachment = yield* get(userId, id)
      const url = yield* store.url(id)

      if (Option.isNone(url)) return yield* new AttachmentNotFoundError({ id })
      return { attachment, url: url.value }
    })

    const remove = Effect.fn('AttachmentService.delete')(function* (
      userId: UserId,
      id: AttachmentId,
    ) {
      const found = yield* attachments.selectById(id)
      const now = yield* DateTime.now
      yield* ensureBindable(found, { id, userId, now })

      yield* attachments.deleteByIds([id])
      yield* store.delete(id)
    })

    // One batch read; the refusal still names the first bad id in the order asked.
    const bind = Effect.fn('AttachmentService.bind')(function* (
      userId: UserId,
      ids: ReadonlyArray<AttachmentId>,
      messageId: MessageId,
    ) {
      const stored = yield* attachments.selectByIds(ids)
      const now = yield* DateTime.now
      const found = new Map(Arr.map(stored, (attachment) => [attachment.id, attachment]))

      yield* Effect.forEach(ids, (id) =>
        ensureBindable(Option.fromUndefinedOr(found.get(id)), { id, userId, now }),
      )

      // Keep first: unbound bytes expire, so a crash must never leave a bound row over them.
      yield* Effect.forEach(ids, store.keep, { discard: true })
      const bound = yield* attachments.update(
        { messageId: Option.some(messageId) },
        { id: ids, messageId: Option.none() },
      )
      const byId = new Map(Arr.map(bound, (attachment) => [attachment.id, attachment]))
      return yield* Effect.forEach(ids, (id) =>
        Effect.fromOption(
          Option.fromUndefinedOr(byId.get(id)),
          () => new AttachmentBoundError({ id }),
        ),
      )
    })

    return { upload, get, download, delete: remove, bind, deleteByIds }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
