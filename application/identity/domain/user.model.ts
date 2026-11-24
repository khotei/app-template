import type { Redacted } from 'effect'

import { Stored } from '@app-template/packages/schema'

import { UserId } from '#identity/contract/user.util'

export class User extends Stored.Class<User>('User')({
  id: Stored.GeneratedId(UserId),
  createdAt: Stored.CreatedAt,
}) {}

/** The 32 random bytes a user signs in with, as base64url; only its hash is stored. */
export type UserSecret = Redacted.Redacted<string>

export const secretBytes = 32
