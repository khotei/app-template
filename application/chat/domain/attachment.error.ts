import { Schema } from 'effect'

import { AttachmentId } from '#chat/domain/attachment.id'

export class AttachmentNotFoundError extends Schema.TaggedError<AttachmentNotFoundError>()(
  'AttachmentNotFoundError',
  { id: AttachmentId },
) {}

export class AttachmentBoundError extends Schema.TaggedError<AttachmentBoundError>()(
  'AttachmentBoundError',
  { id: AttachmentId },
) {}
