import { Context, DateTime, Duration, Effect, Option, Predicate, type Stream } from 'effect'

import { AttachmentBoundError, AttachmentNotFoundError } from '#domain/attachment/attachment.error'
import type { AttachmentId } from '#domain/attachment/attachment.id'
import {
  Attachment,
  type AttachmentMeta,
  type FileName,
  type FileSize,
  type MediaType,
} from '#domain/attachment/attachment.model'
import { ensureFound } from '#domain/shared/guard'
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
    /** Deletes the attachments found; unknown ids are skipped. */
    readonly deleteByIds: (ids: ReadonlyArray<AttachmentId>) => Effect.Effect<void>
  }
>()('@app-template/domain/attachment/AttachmentRepository') {}

export class AttachmentStore extends Context.Service<
  AttachmentStore,
  {
    /** Writes the bytes marked unbound; fails with the stream's error and leaves nothing behind. */
    readonly insert: <E>(
      id: AttachmentId,
      content: Stream.Stream<Uint8Array, E>,
      meta: AttachmentMeta,
    ) => Effect.Effect<FileSize, E>
    readonly select: (id: AttachmentId) => Effect.Effect<Option.Option<Uint8Array>>
    /**
     * A URL that serves the bytes with the stored media type and inline disposition; none for
     * an id without bytes.
     */
    readonly url: (id: AttachmentId) => Effect.Effect<Option.Option<URL>>
    /**
     * Clears the unbound mark, so lifecycle never collects the bytes; idempotent, and a no-op for
     * an id without bytes.
     */
    readonly keep: (id: AttachmentId) => Effect.Effect<void>
    /** Idempotent. */
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

/** The bucket's expiration rule for unbound objects must not act sooner. */
export const unboundLifetime = Duration.hours(24)

export const isExpired = (attachment: Attachment, now: DateTime.Utc): boolean =>
  Option.isNone(attachment.messageId) &&
  DateTime.isGreaterThanOrEqualTo(now, DateTime.addDuration(attachment.createdAt, unboundLifetime))

export const isVisibleTo = (userId: UserId, now: DateTime.Utc): Predicate.Predicate<Attachment> =>
  Predicate.and(
    isOwnedBy(userId),
    Predicate.not((attachment: Attachment) => isExpired(attachment, now)),
  )

/** Returns the attachment when the user may bind it. */
export const ensureBindable = Effect.fn('ensureBindable')(function* (
  found: Option.Option<Attachment>,
  {
    id,
    userId,
    now,
  }: { readonly id: AttachmentId; readonly userId: UserId; readonly now: DateTime.Utc },
) {
  const owned = yield* ensureFound(
    found,
    isVisibleTo(userId, now),
    () => new AttachmentNotFoundError({ id }),
  )
  if (Option.isSome(owned.messageId)) return yield* new AttachmentBoundError({ id })
  return owned
})
