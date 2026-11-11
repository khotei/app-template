import { Schema } from 'effect'

import { MessageId, RunId } from '#chat/domain/chat.id'
import { Status } from '#chat/domain/status.model'

export class RunStatusInvalidError extends Schema.TaggedError<RunStatusInvalidError>()(
  'RunStatusInvalidError',
  { id: RunId, from: Status, to: Status },
) {}

export class RunNotFoundError extends Schema.TaggedError<RunNotFoundError>()('RunNotFoundError', {
  id: RunId,
}) {}

export class RunNotRetryableError extends Schema.TaggedError<RunNotRetryableError>()(
  'RunNotRetryableError',
  { userMessageId: MessageId },
) {}

export class RunNotQueuedError extends Schema.TaggedError<RunNotQueuedError>()(
  'RunNotQueuedError',
  { id: RunId },
) {}
