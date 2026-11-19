import { Schema } from 'effect'

import { MessageId } from '#chat/domain/message.util'
import { RunId } from '#chat/domain/run.util'
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

/** SQS refused the Run's job; `cause` is the queue's error, which the api keeps off the wire. */
export class RunNotQueuedError extends Schema.TaggedError<RunNotQueuedError>()(
  'RunNotQueuedError',
  { id: RunId, cause: Schema.Defect() },
) {}
