import { Data } from 'effect'

/**
 * No answer came, and no further request would bring one: `askModel` has spent its retries or
 * knows none would help. `cause` is operator detail.
 */
export class LlmError extends Data.TaggedError('LlmError')<{ readonly cause: string }> {}
