import { Schema } from 'effect'
import { Multipart } from 'effect/http'
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from 'effect/http-api'

import {
  Attachment,
  AttachmentBoundError,
  AttachmentId,
  AttachmentNotFoundError,
} from '@app-template/application/chat'

/** The files one upload takes, and the attachments one message binds. */
export const maxFiles = 5

export class AttachmentTooLargeError extends Schema.TaggedError<AttachmentTooLargeError>()(
  'AttachmentTooLargeError',
  {},
) {}

export class AttachmentTypeUnsupportedError extends Schema.TaggedError<AttachmentTypeUnsupportedError>()(
  'AttachmentTypeUnsupportedError',
  {},
) {}

const attachmentPath = { attachmentId: AttachmentId }

export class AttachmentHttp extends HttpApiGroup.make('attachments').add(
  HttpApiEndpoint.post('upload', '/attachments', {
    payload: Schema.Struct({ files: Multipart.FilesSchema }).pipe(
      HttpApiSchema.asMultipartStream({ maxParts: maxFiles, maxFileSize: '10 MiB' }),
    ),
    success: Schema.Array(Attachment).pipe(HttpApiSchema.status(201)),
    error: [
      AttachmentTooLargeError.pipe(HttpApiSchema.status(413)),
      AttachmentTypeUnsupportedError.pipe(HttpApiSchema.status(415)),
    ],
  }),
  HttpApiEndpoint.get('list', '/attachments', { success: Schema.Array(Attachment) }),
  HttpApiEndpoint.get('get', '/attachments/:attachmentId', {
    params: attachmentPath,
    success: Attachment,
    error: AttachmentNotFoundError.pipe(HttpApiSchema.status(404)),
  }),
  HttpApiEndpoint.get('download', '/attachments/:attachmentId/download', {
    params: attachmentPath,
    success: HttpApiSchema.Empty(302),
    error: AttachmentNotFoundError.pipe(HttpApiSchema.status(404)),
  }),
  HttpApiEndpoint.delete('delete', '/attachments/:attachmentId', {
    params: attachmentPath,
    error: [
      AttachmentNotFoundError.pipe(HttpApiSchema.status(404)),
      AttachmentBoundError.pipe(HttpApiSchema.status(409)),
    ],
  }),
) {}
