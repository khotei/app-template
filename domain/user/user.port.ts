import { Context, type Effect, type Option, type Types } from 'effect'
import type { RequireAtLeastOne } from 'type-fest'

import type { UserId } from '#domain/user/user.id'
import type { Credential, User } from '#domain/user/user.model'

/** The row where every field named holds; `credential` matches any credential the user has. */
export type UserWhere = Types.Simplify<
  RequireAtLeastOne<{ readonly id: UserId; readonly credential: Credential }>
>

export class UserRepository extends Context.Service<
  UserRepository,
  {
    readonly insert: (user: User, credential: Credential) => Effect.Effect<void>
    readonly selectOne: (where: UserWhere) => Effect.Effect<Option.Option<User>>
  }
>()('@app-template/domain/user/UserRepository') {}
