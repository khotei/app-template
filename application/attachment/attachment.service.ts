import { Array as Arr, Context, Crypto, DateTime, Effect, Layer, Option } from 'effect'

import {
  Attachment,
  type AttachmentBoundError,
  AttachmentId,
  AttachmentNotFoundError,
  AttachmentRepository,
  AttachmentStore,
  buildAttachment,
  ensureBindable,
  type FileName,
  FileSize,
  type MediaType,
} from '@app-template/domain/attachment'
import type { MessageId } from '@app-template/domain/chat'
import { ensureFound } from '@app-template/domain/shared'
import { isOwnedBy, type UserId } from '@app-template/domain/user'

export interface AttachmentUpload {
  readonly fileName: FileName
  readonly mediaType: MediaType
  readonly bytes: Uint8Array
}

export interface AttachmentDownload {
  readonly attachment: Attachment
  readonly bytes: Uint8Array
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
    readonly upload: (userId: UserId, input: AttachmentUpload) => Effect.Effect<Attachment>
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

    const upload = Effect.fn('AttachmentService.upload')(function* (
      userId: UserId,
      input: AttachmentUpload,
    ) {
      const id = AttachmentId.make(yield* Effect.orDie(crypto.randomUUIDv7()))
      const createdAt = yield* DateTime.now
      const attachment = buildAttachment({
        id,
        userId,
        fileName: input.fileName,
        mediaType: input.mediaType,
        size: FileSize.make(input.bytes.length),
        createdAt,
      })

      yield* store.insert(id, input.bytes)
      yield* attachments.insert(attachment)
      return attachment
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
      const bytes = yield* store.select(id)

      if (Option.isNone(bytes)) return yield* new AttachmentNotFoundError({ id })
      return { attachment, bytes: bytes.value }
    })

    const deleteAttachment = Effect.fn('AttachmentService.delete')(function* (
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

    const deleteByIds = Effect.fn('AttachmentService.deleteByIds')(function* (
      ids: ReadonlyArray<AttachmentId>,
    ) {
      yield* attachments.deleteByIds(ids)
      yield* Effect.forEach(ids, store.delete, { discard: true })
    })

    return { upload, get, download, delete: deleteAttachment, findBindable, bind, deleteByIds }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
