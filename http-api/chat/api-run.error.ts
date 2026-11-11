import { Schema } from 'effect'

import { RunId } from '#http-api/shared/ids'

export class RunNotFoundError extends Schema.TaggedError<RunNotFoundError>()(
  'RunNotFoundError',
  { id: RunId },
  { httpApiStatus: 404 },
) {}
