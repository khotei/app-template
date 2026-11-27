import { type Redacted, Schema } from 'effect'

import { UserId } from '@app-template/application/user/contract'

/** What a request's credential names; the user's whole record is a `User`. */
export class Identity extends Schema.Class<Identity>('Identity')({ userId: UserId }) {}

export class IdentityUnknownError extends Schema.TaggedError<IdentityUnknownError>()(
  'IdentityUnknownError',
  {},
  { httpApiStatus: 401 },
) {}

/** The 32 random bytes a user signs in with, as base64url; only its hash is stored. */
export type UserSecret = Redacted.Redacted<string>

export const randomBytesPerSecret = 32
