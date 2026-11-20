import { Data, Schema } from 'effect'

import { RunId } from '#chat/domain/run.util'
import { Status } from '#chat/domain/status.model'

export class RunStatusInvalidError extends Schema.TaggedError<RunStatusInvalidError>()(
  'RunStatusInvalidError',
  { id: RunId, from: Status, to: Status },
) {}

export class RunNotFoundError extends Schema.TaggedError<RunNotFoundError>()('RunNotFoundError', {
  id: RunId,
}) {}

export class RunStartedError extends Data.TaggedError('RunStartedError')<{
  readonly id: RunId
}> {
  override get message() {
    return 'the worker that started the Run stopped before it ended'
  }
}

export class RunNotRetryableError extends Schema.TaggedError<RunNotRetryableError>()(
  'RunNotRetryableError',
  {},
) {}
