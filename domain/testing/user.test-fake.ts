import { Context, Effect, Equal, HashMap, Layer, Option, Ref } from 'effect'

import type { UserId } from '#domain/user/user.id'
import type { Credential, User } from '#domain/user/user.model'
import { type UserOneWhere, UserRepository } from '#domain/user/user.port'

/** A user with the credential it was inserted with. */
export interface UserRow {
  readonly user: User
  readonly credential: Credential
}

/** The rows `UserRepositoryTest` keeps, by user id, for a test to arrange or read. */
export class UserRows extends Context.Service<
  UserRows,
  Ref.Ref<HashMap.HashMap<UserId, UserRow>>
>()('@app-template/domain/testing/UserRows') {
  static readonly layer = Layer.effect(this, Ref.make(HashMap.empty<UserId, UserRow>()))
}

const holdsWhere = (where: UserOneWhere) => (row: UserRow) =>
  (where.id === undefined || row.user.id === where.id) &&
  (where.credential === undefined || Equal.equals(row.credential, where.credential))

export const UserRepositoryTest = Layer.effect(
  UserRepository,
  UserRows.useSync((rows) =>
    UserRepository.of({
      insert: (user, credential) => Ref.update(rows, HashMap.set(user.id, { user, credential })),
      selectOne: (where) =>
        Ref.get(rows).pipe(
          Effect.map(HashMap.findFirst(holdsWhere(where))),
          Effect.map(Option.map(([, row]) => row.user)),
        ),
    }),
  ),
)
