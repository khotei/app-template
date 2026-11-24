import { DateTime, type Redacted, Schema } from 'effect'
import { Model } from 'effect/schema'

import { UserId } from '#identity/contract/user.util'

/**
 * `makeEffect` makes an `id` left out, a UUIDv7, and stamps a `createdAt` left out with the
 * clock's now.
 */
export class User extends Schema.Class<User>('User')({
  id: Model.UuidV7WithGenerate(UserId),
  createdAt: Schema.DateTimeUtcFromDate.pipe(Schema.withConstructorDefault(DateTime.now)),
}) {}

/** The 32 random bytes a user signs in with, as base64url; only its hash is stored. */
export type UserSecret = Redacted.Redacted<string>

export const secretBytes = 32
