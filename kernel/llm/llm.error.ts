import { Schema } from 'effect'

/** The model declined to answer; `cause` is operator detail and never reaches the wire. */
export class LlmRefusedError extends Schema.TaggedError<LlmRefusedError>()('LlmRefusedError', {
  cause: Schema.String,
}) {}

/** No answer came, and no further request would bring one; `cause` never reaches the wire. */
export class LlmFailedError extends Schema.TaggedError<LlmFailedError>()('LlmFailedError', {
  cause: Schema.String,
}) {}

/** Both are final: `askModel` has spent its retries or knows none would help. */
export type LlmError = LlmRefusedError | LlmFailedError
