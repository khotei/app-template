import { type DateTime, Schema } from 'effect'

import { UserId } from '#domain/user/user.id'

export class User extends Schema.Class<User>('User')({
  id: UserId,
  createdAt: Schema.DateTimeUtc,
}) {}

/**
 * The pattern a `SecretHash` matches, which a database check also reads as SQL, so it uses only
 * syntax that JavaScript and Postgres regular expressions read alike.
 */
export const secretHashPattern = /^[0-9a-f]{64}$/

/** The lower-case hex SHA-256 of a user secret; the secret itself is never stored. */
export const SecretHash = Schema.String.check(Schema.isPattern(secretHashPattern)).pipe(
  Schema.brand('SecretHash'),
)
export type SecretHash = typeof SecretHash.Type

export class Credential extends Schema.Class<Credential>('Credential')({
  kind: Schema.Literal('secret'),
  hash: SecretHash,
}) {}

export const buildUser = (input: { readonly id: UserId; readonly createdAt: DateTime.Utc }): User =>
  new User({ id: input.id, createdAt: input.createdAt })
