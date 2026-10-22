import {
  Array as Arr,
  Context,
  Crypto,
  DateTime,
  Effect,
  Layer,
  Option,
  Predicate,
  Ref,
  Stream,
  Struct,
} from 'effect'

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
    /** Finds the user's attachment, bound or not. */
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

    // An expired attachment reads as absent and is removed when met: no sweep reaches it.
    const selectLive = Effect.fnUntraced(function* (ids: ReadonlyArray<AttachmentId>) {
      const found = yield* attachments.selectByIds(ids)
      const now = yield* DateTime.now

      const isExpiredNow = (attachment: Attachment) => isExpired(attachment, now)
      const expired = Arr.filter(found, isExpiredNow)
      if (Arr.isReadonlyArrayNonEmpty(expired)) {
        yield* deleteByIds(Arr.map(expired, (attachment) => attachment.id))
      }
      return Arr.filter(found, Predicate.not(isExpiredNow))
    })

    const get = Effect.fn('AttachmentService.get')(function* (userId: UserId, id: AttachmentId) {
      const found = yield* selectLive([id])
      return yield* ensureFound(
        Arr.head(found),
        isOwnedBy(userId),
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
      const found = yield* selectLive([id])
      yield* ensureBindable(Arr.head(found), { id, userId })

      yield* attachments.deleteByIds([id])
      yield* store.delete(id)
    })

    // One batch read; the refusal still names the first bad id in the order asked.
    const findBindable = Effect.fn('AttachmentService.findBindable')(function* (
      userId: UserId,
      ids: ReadonlyArray<AttachmentId>,
    ) {
      const stored = yield* selectLive(ids)
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
  static readonly layer = Layer.effect(this, this.make)
}
