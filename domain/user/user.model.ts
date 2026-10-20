import { Schema } from 'effect'

import { UserId } from '#domain/user/user.id'

export class User extends Schema.Class<User>('User')({
  id: UserId,
  createdAt: Schema.DateTimeUtc,
}) {}

/** The lower-case hex SHA-256 of a user secret; the secret itself is never stored. */
export const SecretHash = Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/)).pipe(
  Schema.brand('SecretHash'),
)
export type SecretHash = typeof SecretHash.Type

export class Credential extends Schema.Class<Credential>('Credential')({
  kind: Schema.Literal('secret'),
  hash: SecretHash,
}) {}
