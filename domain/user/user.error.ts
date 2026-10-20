import { Schema } from 'effect'

export class UserUnknownError extends Schema.TaggedError<UserUnknownError>()(
  'UserUnknownError',
  {},
) {}
