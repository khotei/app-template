import { Schema } from 'effect'

import { AttachmentId, ChatId } from '#http-api/shared/ids'

export class AttachmentNotFoundError extends Schema.TaggedError<AttachmentNotFoundError>()(
  'AttachmentNotFoundError',
  { ids: Schema.NonEmptyArray(AttachmentId) },
  { httpApiStatus: 404 },
) {}

export class AttachmentBoundError extends Schema.TaggedError<AttachmentBoundError>()(
  'AttachmentBoundError',
  { id: AttachmentId, chatIds: Schema.Array(ChatId) },
  { httpApiStatus: 409 },
) {}

export class AttachmentTooLargeError extends Schema.TaggedError<AttachmentTooLargeError>()(
  'AttachmentTooLargeError',
  {},
  { httpApiStatus: 413 },
) {}

export class AttachmentTypeUnsupportedError extends Schema.TaggedError<AttachmentTypeUnsupportedError>()(
  'AttachmentTypeUnsupportedError',
  {},
  { httpApiStatus: 415 },
) {}
