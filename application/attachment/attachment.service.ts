import { Array as Arr, Context, Crypto, DateTime, Effect, Layer, Option, Ref, Stream } from 'effect'

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

    const uploadFile = Effect.fnUntraced(function* <E>(userId: UserId, input: AttachmentUpload<E>) {
      const id = yield* randomAttachmentId
      const createdAt = yield* DateTime.now

      const size = yield* store.insert(id, input.content, input)
      const attachment = buildAttachment({
        id,
        userId,
        fileName: input.fileName,
        mediaType: input.mediaType,
        size,
        createdAt,
      })

      yield* attachments.insert(attachment)
      return attachment
    })

    const removeByIds = Effect.fnUntraced(function* (ids: ReadonlyArray<AttachmentId>) {
      yield* attachments.deleteByIds(ids)
      yield* Effect.forEach(ids, store.delete, { discard: true })
    })

    const upload = Effect.fn('AttachmentService.upload')(function* <E>(
      userId: UserId,
      files: Stream.Stream<AttachmentUpload<E>, E>,
    ) {
      const stored = yield* Ref.make(Arr.empty<AttachmentId>())
      const removeStored = Effect.flatMap(Ref.get(stored), removeByIds)

      return yield* files.pipe(
        Stream.mapEffect((file) => uploadFile(userId, file)),
        Stream.tap((attachment) => Ref.update(stored, Arr.append(attachment.id))),
        Stream.runCollect,
        Effect.onError(() => removeStored),
      )
    })

    const get = Effect.fn('AttachmentService.get')(function* (userId: UserId, id: AttachmentId) {
      const found = yield* attachments.selectById(id)
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
      const found = yield* attachments.selectById(id)
      yield* ensureBindable(found, { id, userId })

      yield* attachments.deleteByIds([id])
      yield* store.delete(id)
    })

    // One batch read; the refusal still names the first bad id in the order asked.
    const findBindable = Effect.fn('AttachmentService.findBindable')(function* (
      userId: UserId,
      ids: ReadonlyArray<AttachmentId>,
    ) {
      const stored = yield* attachments.selectByIds(ids)
      const found = new Map(Arr.map(stored, (attachment) => [attachment.id, attachment]))

      const bindable = yield* Effect.forEach(ids, (id) =>
        ensureBindable(Option.fromUndefinedOr(found.get(id)), { id, userId }),
      )
      return new BindableAttachments(bindable)
    })

    const bind = Effect.fn('AttachmentService.bind')(function* (
      bindable: BindableAttachments,
      messageId: MessageId,
    ) {
      const bound = Arr.map(
        bindable.attachments,
        (attachment) => new Attachment({ ...attachment, messageId: Option.some(messageId) }),
      )

      yield* Effect.forEach(bound, attachments.update, { discard: true })
      return bound
    })

    const deleteByIds = Effect.fn('AttachmentService.deleteByIds')(removeByIds)

    return { upload, get, download, delete: remove, findBindable, bind, deleteByIds }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
