import { Schema, type Types } from 'effect'

import { credentialKinds, secretHashPattern } from '@app-template/kernel/data'

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

export class Credential extends Schema.Class<Credential>('Credential')({
  kind: Schema.Literals(credentialKinds),
  hash: SecretHash,
}) {}

export const buildUser = (fields: Types.Simplify<Pick<User, 'id' | 'createdAt'>>): User =>
  new User(fields)
