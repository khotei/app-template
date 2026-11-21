import { Data, Schema } from 'effect'

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

/**
 * The user's message `userMessageId` has no active Run: its Run is done or failed, or its chat is
 * deleted.
 */
export class ActiveRunNotFoundError extends Schema.TaggedError<ActiveRunNotFoundError>()(
  'ActiveRunNotFoundError',
  { userMessageId: MessageId },
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
) {}
