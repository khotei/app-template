import { type Redacted, Schema } from 'effect'
import { Model } from 'effect/schema'

import { decodeWith, makeRowWith } from '@app-template/packages/schema'

import { UserId } from '#identity/contract/user.util'

export class User extends Model.Class<User>('User')({
  id: Model.UuidV7Insert(UserId),
  createdAt: Model.DateTimeInsertFromDate,
}) {
  static readonly decodeOne = decodeWith(Schema.Option(this))
  static readonly makeInsert = makeRowWith(this.insert)
}

/** The 32 random bytes a user signs in with, as base64url; only its hash is stored. */
export type UserSecret = Redacted.Redacted<string>

export const secretBytes = 32
