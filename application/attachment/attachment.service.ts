import { Context, Crypto, DateTime, Effect, Layer, Option } from 'effect'

import {
  type Attachment,
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
      const attachment = buildAttachment({
        id,
        userId,
        fileName: input.fileName,
        mediaType: input.mediaType,
        size: FileSize.make(input.bytes.length),
        createdAt: yield* DateTime.now,
      })
      yield* store.insert(id, input.bytes)
      yield* attachments.insert(attachment)
      return attachment
    })

    const get = Effect.fn('AttachmentService.get')(function* (userId: UserId, id: AttachmentId) {
      const owned = Option.filter(yield* attachments.selectById(id), isOwnedBy(userId))
      if (Option.isNone(owned)) return yield* new AttachmentNotFoundError({ id })
      return owned.value
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

    const remove = Effect.fn('AttachmentService.delete')(function* (
      userId: UserId,
      id: AttachmentId,
    ) {
      yield* ensureBindable(id, yield* attachments.selectById(id), userId)
      yield* attachments.deleteByIds([id])
      yield* store.delete(id)
    })

    return { upload, get, download, delete: remove }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
