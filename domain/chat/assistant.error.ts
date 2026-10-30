import { Schema } from 'effect'

/** The model declined to answer; `cause` is operator detail and never reaches the wire. */
export class AssistantRefusedError extends Schema.TaggedError<AssistantRefusedError>()(
  'AssistantRefusedError',
  { cause: Schema.String },
) {}

/** No answer came, and no further request would bring one; `cause` never reaches the wire. */
export class AssistantFailedError extends Schema.TaggedError<AssistantFailedError>()(
  'AssistantFailedError',
  { cause: Schema.String },
) {}
