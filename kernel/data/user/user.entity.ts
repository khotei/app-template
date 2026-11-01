import { createInsertSchema, createSelectSchema } from 'drizzle-orm/effect-schema'
import type { Types } from 'effect'
import type { RequireAtLeastOne } from 'type-fest'

import { type credentials, users } from '#kernel/data/user/user.table'

export const UserEntity = createSelectSchema(users)

export type UserEntity = typeof UserEntity.Type

export const UserEntityInsert = createInsertSchema(users)

export type UserEntityCredential = Pick<typeof credentials.$inferSelect, 'kind' | 'hash'>

/** `credential` matches any credential the user holds. */
export type UserEntityWhere = Types.Simplify<
  RequireAtLeastOne<Pick<UserEntity, 'id'> & { readonly credential: UserEntityCredential }>
>
