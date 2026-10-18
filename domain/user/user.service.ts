import { Context, type DateTime, type Effect, type Option } from 'effect'

import type { UserId } from '#domain/user/user.id'
import { type Credential, User } from '#domain/user/user.model'

export class UserRepository extends Context.Service<
  UserRepository,
  {
    readonly insert: (user: User, credential: Credential) => Effect.Effect<void>
    readonly selectById: (id: UserId) => Effect.Effect<Option.Option<User>>
    readonly selectByCredential: (credential: Credential) => Effect.Effect<Option.Option<User>>
  }
>()('@app-template/domain/user/UserRepository') {}

export const buildUser = (input: { readonly id: UserId; readonly createdAt: DateTime.Utc }): User =>
  new User({ id: input.id, createdAt: input.createdAt })
