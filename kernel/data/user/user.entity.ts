import { createSelectSchema } from 'drizzle-orm/effect-schema'
import type { Types } from 'effect'

import type { Keyed } from '@app-template/packages/db'

import type { FilterOf } from '#kernel/data/relations'
import { type CredentialColumns, users } from '#kernel/data/user/user.table'

export const UserEntity = createSelectSchema(users)

export type UserEntity = typeof UserEntity.Type

export type UserEntityCredential = Types.Simplify<Pick<CredentialColumns, 'kind' | 'hash'>>

/** A user by the key or by `credentials`, which matches any credential the user holds. */
export type UserEntityWhere = Keyed<
  FilterOf<'users'>,
  UserEntity & { readonly credentials: UserEntityCredential },
  'id' | 'credentials'
>
