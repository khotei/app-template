import { Data, Schema } from 'effect'

import { MessageId } from '#chat/domain/message.util'
import { RunId } from '#chat/domain/run.util'
import type { Status } from '#chat/domain/status.model'

export class RunStatusInvalidError extends Data.TaggedError('RunStatusInvalidError')<{
  readonly id: RunId
  readonly from: Status
  readonly to: Status
}> {}

export class RunNotFoundError extends Schema.TaggedError<RunNotFoundError>()(
  'RunNotFoundError',
  {
    where: Schema.Union([
      Schema.Struct({ id: RunId }),
      Schema.Struct({ userMessageId: MessageId }),
    ]),
  },
  { httpApiStatus: 404 },
) {}

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
  { httpApiStatus: 409 },
) {}
