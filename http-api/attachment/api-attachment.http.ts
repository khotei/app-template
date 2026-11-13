import { Schema } from 'effect'
import { Multipart } from 'effect/http'
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from 'effect/http-api'

import {
  AttachmentBoundError,
  AttachmentNotFoundError,
  AttachmentTooLargeError,
  AttachmentTypeUnsupportedError,
} from '#http-api/attachment/api-attachment.error'
import { ApiAttachment } from '#http-api/attachment/api-attachment.model'
import { AttachmentId } from '#http-api/shared/ids'
import * as limits from '#http-api/shared/limits'
import { Auth } from '#http-api/shared/security'

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
