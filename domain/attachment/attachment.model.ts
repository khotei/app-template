import { Schema } from 'effect'

import { AttachmentId } from '#domain/attachment/attachment.id'
import { MessageId } from '#domain/chat/chat.id'
import { UserId } from '#domain/user/user.id'

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
