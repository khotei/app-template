import { DateTime, Duration, Effect, Option, Predicate, Schema } from 'effect'

import { AttachmentBoundError } from '#domain/attachment/attachment.error'
import { AttachmentId } from '#domain/attachment/attachment.id'
import { ChatId, MessageId } from '#domain/chat/chat.id'
import { UserId } from '#domain/user/user.id'

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
  /** The chat of `messageId`, set with it, so a chat's attachments are found without its messages. */
  chatId: Schema.Option(ChatId),
  fileName: FileName,
  mediaType: MediaType,
  size: FileSize,
  createdAt: Schema.DateTimeUtc,
}) {}

/** What the bucket keeps beside the bytes. */
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
    chatId: Option.none(),
    fileName: input.fileName,
    mediaType: input.mediaType,
    size: input.size,
    createdAt: input.createdAt,
  })

export const unboundLifetime = Duration.hours(24)

const isUnbound: Predicate.Predicate<Attachment> = (attachment) =>
  Option.isNone(attachment.messageId)

export const isExpiredAt = (now: DateTime.Utc): Predicate.Predicate<Attachment> =>
  Predicate.and(isUnbound, (attachment) =>
    DateTime.isGreaterThanOrEqualTo(
      now,
      DateTime.addDuration(attachment.createdAt, unboundLifetime),
    ),
  )

/** The attachment bound to the message of the chat. */
export const bindAttachment = (
  attachment: Attachment,
  { messageId, chatId }: { readonly messageId: MessageId; readonly chatId: ChatId },
): Attachment =>
  new Attachment({ ...attachment, messageId: Option.some(messageId), chatId: Option.some(chatId) })

export const ensureUnbound = (
  attachment: Attachment,
): Effect.Effect<Attachment, AttachmentBoundError> =>
  Option.match(attachment.messageId, {
    onNone: () => Effect.succeed(attachment),
    onSome: () => Effect.fail(new AttachmentBoundError({ id: attachment.id })),
  })
