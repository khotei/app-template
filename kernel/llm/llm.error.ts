import { Schema } from 'effect'

/**
 * No answer came, and no further request would bring one: `askModel` has spent its retries or
 * knows none would help. `cause` is operator detail and never reaches the wire.
 */
export class LlmError extends Schema.TaggedError<LlmError>()('LlmError', {
  cause: Schema.String,
}) {}
