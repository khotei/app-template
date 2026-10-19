import { Schema } from 'effect'

/** `path` mixes property names and array indices, as Standard Schema reports them. */
export const RequestIssue = Schema.Struct({
  path: Schema.Array(Schema.Union([Schema.String, Schema.Int])),
  message: Schema.String,
})
export type RequestIssue = typeof RequestIssue.Type

export class RequestInvalidError extends Schema.TaggedError<RequestInvalidError>()(
  'RequestInvalidError',
  { issues: Schema.Array(RequestIssue) },
  { httpApiStatus: 400 },
) {}

export class AttachmentTooLargeError extends Schema.TaggedError<AttachmentTooLargeError>()(
  'AttachmentTooLargeError',
  {},
  { httpApiStatus: 413 },
) {}

export class AttachmentTypeUnsupportedError extends Schema.TaggedError<AttachmentTypeUnsupportedError>()(
  'AttachmentTypeUnsupportedError',
  {},
  { httpApiStatus: 415 },
) {}
