import { Schema } from 'effect'

import { secretHashPattern } from '@app-template/kernel/data'

import { UserId } from '#identity/contract/user.id'

export class User extends Schema.Class<User>('User')({
  id: UserId,
  createdAt: Schema.DateTimeUtc,
}) {}

/** The lower-case hex SHA-256 of a user secret; the secret itself is never stored. */
export const SecretHash = Schema.String.check(Schema.isPattern(secretHashPattern)).pipe(
  Schema.brand('SecretHash'),
)
export type SecretHash = typeof SecretHash.Type
