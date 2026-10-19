import { Context, type DateTime, Effect, Option } from 'effect'

import { AttachmentBoundError, AttachmentNotFoundError } from '#domain/attachment/attachment.error'
import type { AttachmentId } from '#domain/attachment/attachment.id'
import {
  Attachment,
  type FileName,
  type FileSize,
  type MediaType,
} from '#domain/attachment/attachment.model'
import type { UserId } from '#domain/user/user.id'
import { isOwnedBy } from '#domain/user/user.service'

export class AttachmentRepository extends Context.Service<
  AttachmentRepository,
  {
    readonly insert: (attachment: Attachment) => Effect.Effect<void>
    readonly update: (attachment: Attachment) => Effect.Effect<void>
    readonly selectById: (id: AttachmentId) => Effect.Effect<Option.Option<Attachment>>
    /** Returns the attachments found, in the order asked; unknown ids are left out. */
    readonly selectByIds: (
      ids: ReadonlyArray<AttachmentId>,
    ) => Effect.Effect<ReadonlyArray<Attachment>>
    readonly deleteByIds: (ids: ReadonlyArray<AttachmentId>) => Effect.Effect<void>
  }
>()('@app-template/domain/attachment/AttachmentRepository') {}

export class AttachmentStore extends Context.Service<
  AttachmentStore,
  {
    readonly insert: (id: AttachmentId, bytes: Uint8Array) => Effect.Effect<void>
    readonly select: (id: AttachmentId) => Effect.Effect<Option.Option<Uint8Array>>
    readonly delete: (id: AttachmentId) => Effect.Effect<void>
  }
>()('@app-template/domain/attachment/AttachmentStore') {}

export const buildAttachment = (input: {
  readonly id: AttachmentId
  readonly userId: UserId
  readonly fileName: FileName
  readonly mediaType: MediaType
  readonly size: FileSize
  readonly createdAt: DateTime.Utc
}): Attachment =>
  new Attachment({
    id: input.id,
    userId: input.userId,
    messageId: Option.none(),
    fileName: input.fileName,
    mediaType: input.mediaType,
    size: input.size,
    createdAt: input.createdAt,
  })

/** Returns the attachment when the user may bind it. */
export const ensureBindable = Effect.fn('ensureBindable')(function* (
  id: AttachmentId,
  found: Option.Option<Attachment>,
  userId: UserId,
) {
  const owned = Option.filter(found, isOwnedBy(userId))
  if (Option.isNone(owned)) return yield* new AttachmentNotFoundError({ id })
  if (Option.isSome(owned.value.messageId)) return yield* new AttachmentBoundError({ id })
  return owned.value
})
