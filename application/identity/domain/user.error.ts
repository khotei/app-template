import { Schema } from 'effect'

export class UserUnknownError extends Schema.TaggedError<UserUnknownError>()(
  'UserUnknownError',
  {},
  { httpApiStatus: 401 },
) {}
