import {
  Array as Arr,
  Context,
  Crypto,
  DateTime,
  Effect,
  Layer,
  Option,
  Ref,
  Result,
  Stream,
  Struct,
} from 'effect'
import { identity } from 'effect/Function'

import {
  Attachment,
  type AttachmentBoundError,
  type AttachmentDownload,
  AttachmentId,
  type AttachmentMeta,
  AttachmentNotFoundError,
  AttachmentRepository,
  AttachmentStore,
  buildAttachment,
  ensureBindable,
  isExpired,
} from '@app-template/domain/attachment'
import type { MessageId } from '@app-template/domain/chat'
import { ensureFound } from '@app-template/domain/shared'
import { isOwnedBy, type UserId } from '@app-template/domain/user'

import { UserLock } from '#application/user/user-lock'

export interface AttachmentUpload<E> extends AttachmentMeta {
  readonly content: Stream.Stream<Uint8Array, E>
}

/**
 * Proof that these attachments may be bound: only `AttachmentService.findBindable` builds one,
 * after it checked that each is the user's and unbound.
 *
 * It holds only while the caller keeps the user's `UserLock` from the check to the bind.
 */
class BindableAttachments {
  declare private readonly proof: never

  constructor(
    /** In the order of the ids asked for. */
    readonly attachments: ReadonlyArray<Attachment>,
  ) {}
}

export type { BindableAttachments }

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
    /**
     * Finds the user's attachment, bound or not.
     *
     * An attachment unbound for `unboundLifetime` is not found, and is deleted under its owner's
     * `UserLock`, so the caller must not hold it.
     */
    readonly get: (
      userId: UserId,
      id: AttachmentId,
    ) => Effect.Effect<Attachment, AttachmentNotFoundError>
    /**
     * An attachment unbound for `unboundLifetime` is not found, and is deleted under its owner's
     * `UserLock`, so the caller must not hold it.
     */
    readonly download: (
      userId: UserId,
      id: AttachmentId,
    ) => Effect.Effect<AttachmentDownload, AttachmentNotFoundError>
    /**
     * Removes the user's attachment while no message holds it.
     *
     * An attachment unbound for `unboundLifetime` is not found, and is deleted under its owner's
     * `UserLock`, so the caller must not hold it.
     */
    readonly delete: (
      userId: UserId,
      id: AttachmentId,
    ) => Effect.Effect<void, AttachmentNotFoundError | AttachmentBoundError>
    /**
     * Run it under the user's `UserLock`. An attachment unbound for `unboundLifetime` is not
     * found; the user's own is deleted, another user's is left for its owner's next request.
     */
    readonly findBindable: (
      userId: UserId,
      ids: ReadonlyArray<AttachmentId>,
    ) => Effect.Effect<BindableAttachments, AttachmentNotFoundError | AttachmentBoundError>
    /** Binds the attachments to the message, and returns them bound. */
    readonly bind: (
      bindable: BindableAttachments,
      messageId: MessageId,
    ) => Effect.Effect<ReadonlyArray<Attachment>>
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
    // Shared with the send, so an expired attachment is never deleted while a send binds it.
    const userLock = yield* UserLock
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

    // Expired attachments read as absent and are deleted when met, since no sweep reaches them.
    const findRemovingExpired = Effect.fnUntraced(function* (
      ids: ReadonlyArray<AttachmentId>,
      deleteExpired: (expired: Arr.NonEmptyReadonlyArray<Attachment>) => Effect.Effect<void>,
    ) {
      const found = yield* attachments.selectByIds(ids)
      const now = yield* DateTime.now

      const [expired, live] = Arr.partition(
        found,
        Result.liftPredicate((attachment: Attachment) => isExpired(attachment, now), identity),
      )
      if (Arr.isReadonlyArrayNonEmpty(expired)) yield* deleteExpired(expired)
      return live
    })

    // Re-read under the owner's lock: a send holding it may have bound the attachment since.
    const deleteIfExpired = (attachment: Attachment) =>
      userLock.withPermit(
        Effect.gen(function* () {
          const found = yield* attachments.selectById(attachment.id)
          const now = yield* DateTime.now

          if (Option.exists(found, (current) => isExpired(current, now))) {
            yield* deleteByIds([attachment.id])
          }
        }),
        attachment.userId,
      )

    const findOneRemovingExpired = (id: AttachmentId) =>
      Effect.map(
        findRemovingExpired([id], (expired) =>
          Effect.forEach(expired, deleteIfExpired, { discard: true }),
        ),
        Arr.head,
      )

    const get = Effect.fn('AttachmentService.get')(function* (userId: UserId, id: AttachmentId) {
      const found = yield* findOneRemovingExpired(id)
      return yield* ensureFound(found, isOwnedBy(userId), () => new AttachmentNotFoundError({ id }))
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
      const found = yield* findOneRemovingExpired(id)
      yield* ensureBindable(found, { id, userId })

      yield* attachments.deleteByIds([id])
      yield* store.delete(id)
    })

    // One batch read; the refusal still names the first bad id in the order asked. The caller
    // holds the user's lock, which is not reentrant: the user's expired attachments are deleted
    // without taking it, and another user's are left, as taking a second lock could deadlock.
    const findBindable = Effect.fn('AttachmentService.findBindable')(function* (
      userId: UserId,
      ids: ReadonlyArray<AttachmentId>,
    ) {
      const stored = yield* findRemovingExpired(ids, (expired) =>
        deleteByIds(Arr.map(Arr.filter(expired, isOwnedBy(userId)), (attachment) => attachment.id)),
      )
      const found = new Map(Arr.map(stored, (attachment) => [attachment.id, attachment]))

      const bindable = yield* Effect.forEach(ids, (id) =>
        ensureBindable(Option.fromUndefinedOr(found.get(id)), { id, userId }),
      )
      return new BindableAttachments(bindable)
    })

    // The bytes are kept first: a crash between leaves an orphaned object, never a bound
    // attachment whose bytes the bucket's expiration rule removed.
    const bind = Effect.fn('AttachmentService.bind')(function* (
      bindable: BindableAttachments,
      messageId: MessageId,
    ) {
      const bound = Arr.map(
        bindable.attachments,
        (attachment) => new Attachment({ ...attachment, messageId: Option.some(messageId) }),
      )

      yield* Effect.forEach(bound, (attachment) => store.keep(attachment.id), { discard: true })
      yield* Effect.forEach(bound, attachments.update, { discard: true })
      return bound
    })

    return { upload, get, download, delete: remove, findBindable, bind, deleteByIds }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make).pipe(Layer.provide(UserLock.layer))
}
