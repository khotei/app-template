import { Schema } from 'effect'

import { MessageId, RunId } from '#http-api/shared/ids'

export class RunNotFoundError extends Schema.TaggedError<RunNotFoundError>()(
  'RunNotFoundError',
  { id: RunId },
  { httpApiStatus: 404 },
) {}

export class RunNotRetryableError extends Schema.TaggedError<RunNotRetryableError>()(
  'RunNotRetryableError',
  { userMessageId: MessageId },
  { httpApiStatus: 409 },
) {}

export class RunNotQueuedError extends Schema.TaggedError<RunNotQueuedError>()(
  'RunNotQueuedError',
  { id: RunId },
  { httpApiStatus: 503 },
) {}
