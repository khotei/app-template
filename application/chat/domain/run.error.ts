import { Schema } from 'effect'

import { RunId } from '#chat/domain/chat.id'
import { Status } from '#chat/domain/status.model'

export class RunStatusInvalidError extends Schema.TaggedError<RunStatusInvalidError>()(
  'RunStatusInvalidError',
  { id: RunId, from: Status, to: Status },
) {}

export class RunNotFoundError extends Schema.TaggedError<RunNotFoundError>()('RunNotFoundError', {
  id: RunId,
}) {}
