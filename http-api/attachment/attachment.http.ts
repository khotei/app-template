import { Schema } from 'effect'
import { Multipart } from 'effect/http'
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from 'effect/http-api'

import { AttachmentTooLargeError, AttachmentTypeUnsupportedError } from '#http-api/shared/errors'
import { AttachmentId, ChatId, MessageId, UserId } from '#http-api/shared/ids'
import * as limits from '#http-api/shared/limits'
import { Auth } from '#http-api/shared/security'

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

export class AttachmentNotFoundError extends Schema.TaggedError<AttachmentNotFoundError>()(
  'AttachmentNotFoundError',
  { ids: Schema.NonEmptyArray(AttachmentId) },
  { httpApiStatus: 404 },
) {}

export class AttachmentBoundError extends Schema.TaggedError<AttachmentBoundError>()(
  'AttachmentBoundError',
  { id: AttachmentId },
  { httpApiStatus: 409 },
) {}

/** A media type an upload may declare; the part's `contentType` is client-supplied. */
export const AttachmentMediaType = Schema.Literals(limits.attachment.mediaTypes).pipe(
  Schema.decodeTo(MediaType),
)

const attachmentPath = { attachmentId: AttachmentId }

export class AttachmentHttp extends HttpApiGroup.make('attachments')
  .add(
    HttpApiEndpoint.post('upload', '/attachments', {
      payload: Schema.Struct({ files: Multipart.FilesSchema }).pipe(
        HttpApiSchema.asMultipartStream({
          maxParts: limits.attachment.maxFiles,
          maxFileSize: limits.attachment.maxFileSize,
        }),
      ),
      success: Schema.Array(ApiAttachment).pipe(HttpApiSchema.status(201)),
      error: [AttachmentTooLargeError, AttachmentTypeUnsupportedError],
    }),
    HttpApiEndpoint.get('get', '/attachments/:attachmentId', {
      params: attachmentPath,
      success: ApiAttachment,
      error: AttachmentNotFoundError,
    }),
    HttpApiEndpoint.get('download', '/attachments/:attachmentId/download', {
      params: attachmentPath,
      success: HttpApiSchema.Empty(302),
      error: AttachmentNotFoundError,
    }),
    HttpApiEndpoint.delete('delete', '/attachments/:attachmentId', {
      params: attachmentPath,
      success: HttpApiSchema.NoContent,
      error: [AttachmentNotFoundError, AttachmentBoundError],
    }),
  )
  .middleware(Auth) {}
