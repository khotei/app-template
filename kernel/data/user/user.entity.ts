import { createInsertSchema, createSelectSchema } from 'drizzle-orm/effect-schema'
import type { Types } from 'effect'
import type { RequireAtLeastOne } from 'type-fest'

import { type credentials, users } from '#kernel/data/user/user.table'

export const UserEntity = createSelectSchema(users)

export const UserEntityInsert = createInsertSchema(users)

/** `credential` matches any credential the user holds. */
export type UserEntityWhere = Types.Simplify<
  RequireAtLeastOne<
    Pick<typeof UserEntity.Type, 'id'> & {
      readonly credential: Pick<typeof credentials.$inferSelect, 'kind' | 'hash'>
    }
  >
>
