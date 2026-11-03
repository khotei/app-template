import { Schema, type Types } from 'effect'

import { UserId } from '#identity/contract/user.id'

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

export const buildUser = (fields: Types.Simplify<Pick<User, 'id' | 'createdAt'>>): User =>
  new User(fields)
