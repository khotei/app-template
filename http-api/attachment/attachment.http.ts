import { Schema, Struct } from 'effect'
import { Multipart } from 'effect/http'
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from 'effect/http-api'

import {
  AttachmentBoundError,
  AttachmentId,
  Attachment as AttachmentModel,
  AttachmentNotFoundError,
  MediaType,
} from '@app-template/domain/attachment'
import { MessageId } from '@app-template/domain/chat'

import { AttachmentTooLargeError, AttachmentTypeUnsupportedError } from '#http-api/shared/errors'
import * as limits from '#http-api/shared/limits'
import { Auth } from '#http-api/shared/security'

export const Attachment = AttachmentModel.mapFields((fields) => ({
  ...Struct.omit(fields, ['userId', 'chatId']),
  messageId: Schema.OptionFromNullOr(MessageId),
}))
export type Attachment = typeof Attachment.Type

/** A media type an upload may declare; the part's `contentType` is client-supplied. */
export const AttachmentMediaType = Schema.Literals(limits.attachment.mediaTypes).pipe(
  Schema.decodeTo(MediaType),
)

const attachmentPath = { attachmentId: AttachmentId }

const attachmentNotFound = AttachmentNotFoundError.pipe(HttpApiSchema.status(404))

export class AttachmentHttp extends HttpApiGroup.make('attachments')
  .add(
    HttpApiEndpoint.post('upload', '/attachments', {
      payload: Schema.Struct({ files: Multipart.FilesSchema }).pipe(
        HttpApiSchema.asMultipartStream({
          maxParts: limits.attachment.maxFiles,
          maxFileSize: limits.attachment.maxFileSize,
        }),
      ),
      success: Schema.Array(Attachment).pipe(HttpApiSchema.status(201)),
      error: [AttachmentTooLargeError, AttachmentTypeUnsupportedError],
    }),
    HttpApiEndpoint.get('get', '/attachments/:attachmentId', {
      params: attachmentPath,
      success: Attachment,
      error: attachmentNotFound,
    }),
    HttpApiEndpoint.get('download', '/attachments/:attachmentId/download', {
      params: attachmentPath,
      success: HttpApiSchema.Empty(302),
      error: attachmentNotFound,
    }),
    HttpApiEndpoint.delete('delete', '/attachments/:attachmentId', {
      params: attachmentPath,
      success: HttpApiSchema.NoContent,
      error: [attachmentNotFound, AttachmentBoundError.pipe(HttpApiSchema.status(409))],
    }),
  )
  .middleware(Auth) {}
