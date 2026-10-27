import { DateTime, Duration, Effect, Option, Predicate, Schema } from 'effect'

import { AttachmentBoundError, AttachmentNotFoundError } from '#domain/attachment/attachment.error'
import { AttachmentId } from '#domain/attachment/attachment.id'
import { MessageId } from '#domain/chat/chat.id'
import { ensureFound } from '#domain/shared/guard'
import { UserId } from '#domain/user/user.id'
import { isOwnedBy } from '#domain/user/user.model'

export const FileName = Schema.String.check(Schema.isNonEmpty()).pipe(Schema.brand('FileName'))
export type FileName = typeof FileName.Type

/**
 * The pattern a `MediaType` matches, which a database check also reads as SQL with `~*` for its
 * `i` flag, so it uses only syntax that JavaScript and Postgres regular expressions read alike.
 */
export const mediaTypePattern = /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/i

/** A `type/subtype` pair of RFC 6838 restricted-name characters, without parameters. */
export const MediaType = Schema.String.check(Schema.isPattern(mediaTypePattern)).pipe(
  Schema.brand('MediaType'),
)
export type MediaType = typeof MediaType.Type

export const FileSize = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)).pipe(
  Schema.brand('FileSize'),
)
export type FileSize = typeof FileSize.Type

export class Attachment extends Schema.Class<Attachment>('Attachment')({
  id: AttachmentId,
  userId: UserId,
  messageId: Schema.Option(MessageId),
  fileName: FileName,
  mediaType: MediaType,
  size: FileSize,
  createdAt: Schema.DateTimeUtc,
}) {}

/** What the store keeps beside the bytes. */
export interface AttachmentMeta {
  readonly mediaType: MediaType
  readonly fileName: FileName
}

export interface AttachmentDownload {
  readonly attachment: Attachment
  readonly url: URL
}

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

export const unboundLifetime = Duration.hours(24)

const isExpired = (attachment: Attachment, now: DateTime.Utc): boolean =>
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
