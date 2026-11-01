import { Context, Effect, HashMap, Layer, Option, Predicate, pipe, Ref } from 'effect'

import type { UserId } from '@app-template/identity-contract'
import { matches } from '@app-template/testing'

import type { Credential, User } from '#domain/user.model'
import { UserRepository, type UserWhere } from '#domain/user.port'

/** A user with the credential it was inserted with. */
export interface UserRow {
  readonly user: User
  readonly credential: Credential
}

/** The rows `UserRepositoryTest` keeps, by user id, for a test to arrange or read. */
export class UserRows extends Context.Service<
  UserRows,
  Ref.Ref<HashMap.HashMap<UserId, UserRow>>
>()('@app-template/identity/testing/UserRows') {
  static readonly layer = Layer.effect(this, Ref.make(HashMap.empty<UserId, UserRow>()))
}

const holdsWhere = (where: UserWhere): Predicate.Predicate<UserRow> =>
  Predicate.and(
    pipe(
      matches<User>({ id: where.id }),
      Predicate.mapInput((row: UserRow) => row.user),
    ),
    matches<UserRow>({ credential: where.credential }),
  )

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
