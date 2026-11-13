import { Schema } from 'effect'

import { AttachmentId, ChatId, MessageId, UserId } from '#http-api/shared/ids'
import * as limits from '#http-api/shared/limits'

export const FileName = Schema.String.check(Schema.isNonEmpty()).pipe(Schema.brand('FileName'))
export type FileName = typeof FileName.Type

/** A `type/subtype` pair of RFC 6838 restricted-name characters, without parameters. */
export const MediaType = Schema.String.check(
  Schema.isPattern(/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/i),
).pipe(Schema.brand('MediaType'))
export type MediaType = typeof MediaType.Type

export const FileSize = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)).pipe(
  Schema.brand('FileSize'),
)
export type FileSize = typeof FileSize.Type

/** A media type an upload may declare; the part's `contentType` is client-supplied. */
export const AttachmentMediaType = Schema.Literals(limits.attachment.mediaTypes).pipe(
  Schema.decodeTo(MediaType),
)

export const ApiAttachment = Schema.Struct({
  id: AttachmentId,
  userId: UserId,
  messageId: Schema.OptionFromNullOr(MessageId),
  chatId: Schema.OptionFromNullOr(ChatId),
  fileName: FileName,
  mediaType: MediaType,
  size: FileSize,
  createdAt: Schema.DateTimeUtc,
})
export type ApiAttachment = typeof ApiAttachment.Type
