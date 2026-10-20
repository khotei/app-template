import { Schema } from 'effect'

import { AttachmentId } from '#domain/attachment/attachment.id'

export class AttachmentNotFoundError extends Schema.TaggedError<AttachmentNotFoundError>()(
  'AttachmentNotFoundError',
  { id: AttachmentId },
) {}

export class AttachmentBoundError extends Schema.TaggedError<AttachmentBoundError>()(
  'AttachmentBoundError',
  { id: AttachmentId },
) {}
