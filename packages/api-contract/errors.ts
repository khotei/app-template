import { Schema } from 'effect'

export class UserUnknown extends Schema.TaggedError<UserUnknown>()(
  'UserUnknown',
  {},
  { httpApiStatus: 401 },
) {}

export class ChatNotFound extends Schema.TaggedError<ChatNotFound>()(
  'ChatNotFound',
  {},
  { httpApiStatus: 404 },
) {}

export class MessageNotFound extends Schema.TaggedError<MessageNotFound>()(
  'MessageNotFound',
  {},
  { httpApiStatus: 404 },
) {}

export class AttachmentNotFound extends Schema.TaggedError<AttachmentNotFound>()(
  'AttachmentNotFound',
  {},
  { httpApiStatus: 404 },
) {}

export class ChatBusy extends Schema.TaggedError<ChatBusy>()(
  'ChatBusy',
  {},
  { httpApiStatus: 409 },
) {}

export class AttachmentBound extends Schema.TaggedError<AttachmentBound>()(
  'AttachmentBound',
  {},
  { httpApiStatus: 409 },
) {}

export class AttachmentTooLarge extends Schema.TaggedError<AttachmentTooLarge>()(
  'AttachmentTooLarge',
  {},
  { httpApiStatus: 413 },
) {}

export class AttachmentTypeUnsupported extends Schema.TaggedError<AttachmentTypeUnsupported>()(
  'AttachmentTypeUnsupported',
  {},
  { httpApiStatus: 415 },
) {}

/** `path` mixes property names and array indices, as Standard Schema reports them. */
export const RequestIssue = Schema.Struct({
  path: Schema.Array(Schema.Union([Schema.String, Schema.Int])),
  message: Schema.String,
})
export type RequestIssue = typeof RequestIssue.Type

export class RequestInvalid extends Schema.TaggedError<RequestInvalid>()(
  'RequestInvalid',
  { issues: Schema.Array(RequestIssue) },
  { httpApiStatus: 400 },
) {}
