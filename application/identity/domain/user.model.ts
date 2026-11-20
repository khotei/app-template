import { type Redacted, Schema } from 'effect'

import { UserId } from '#identity/contract/user.id'

export class User extends Schema.Class<User>('User')({
  id: UserId,
  createdAt: Schema.DateTimeUtcFromDate,
}) {}

/** The 32 random bytes a user signs in with, as base64url; only its hash is stored. */
export type UserSecret = Redacted.Redacted<string>

export const secretBytes = 32
