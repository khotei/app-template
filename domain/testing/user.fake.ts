import { Context, Effect, Equal, HashMap, Layer, Option, Ref } from 'effect'

import type { UserId } from '#domain/user/user.id'
import type { Credential, User } from '#domain/user/user.model'
import { UserRepository } from '#domain/user/user.port'

/** A user with the credential it was inserted with. */
export interface UserRow {
  readonly user: User
  readonly credential: Credential
}

/** The rows `UserRepositoryMemory` keeps, by user id, for a test to arrange or read. */
export class UserRows extends Context.Service<
  UserRows,
  Ref.Ref<HashMap.HashMap<UserId, UserRow>>
>()('@app-template/domain/testing/UserRows') {
  static readonly layer = Layer.effect(this, Ref.make(HashMap.empty<UserId, UserRow>()))
}

export const UserRepositoryMemory = Layer.effect(
  UserRepository,
  Effect.map(UserRows, (rows) =>
    UserRepository.of({
      insert: (user, credential) => Ref.update(rows, HashMap.set(user.id, { user, credential })),
      selectById: (id) =>
        Effect.map(Ref.get(rows), (map) => Option.map(HashMap.get(map, id), (row) => row.user)),
      selectByCredential: (credential) =>
        Effect.map(Ref.get(rows), (map) =>
          Option.map(
            HashMap.findFirst(map, (row) => Equal.equals(row.credential, credential)),
            ([, row]) => row.user,
          ),
        ),
    }),
  ),
)
