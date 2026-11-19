import { Schema } from 'effect'

import { AttachmentId } from '#chat/domain/attachment.id'
import { ChatId } from '#chat/domain/chat.id'

export class AttachmentNotFoundError extends Schema.TaggedError<AttachmentNotFoundError>()(
  'AttachmentNotFoundError',
  { ids: Schema.NonEmptyArray(AttachmentId) },
) {}

export class AttachmentBoundError extends Schema.TaggedError<AttachmentBoundError>()(
  'AttachmentBoundError',
  {
    id: AttachmentId,
    /** The chats whose messages hold it, or a copy sent from it. */
    chatIds: Schema.Array(ChatId),
  },
) {}
