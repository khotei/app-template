import { type Redacted, Schema } from 'effect'

export class IdentityUnknownError extends Schema.TaggedError<IdentityUnknownError>()(
  'IdentityUnknownError',
  {},
  { httpApiStatus: 401 },
) {}

/** The 32 random bytes a user signs in with, as base64url; only its hash is stored. */
export type UserSecret = Redacted.Redacted<string>

export const secretBytes = 32
