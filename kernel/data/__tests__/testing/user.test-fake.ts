import {
  Array as Arr,
  Context,
  Effect,
  HashMap,
  Layer,
  Option,
  Predicate,
  pipe,
  Ref,
  Schema,
} from 'effect'

import { matches, orDieOnNoRows } from '@app-template/packages/testing'

import {
  UserEntity,
  type UserEntityCredential,
  type UserEntityWhere,
} from '#kernel/data/user/user.entity'
import { UserRepository } from '#kernel/data/user/user.repository'

/** A user with the credential it was inserted with. */
export interface UserRow {
  readonly user: UserEntity
  readonly credential: UserEntityCredential
}

/** The rows `UserRepositoryTest` keeps, by user id, for a test to arrange or read. */
export class UserRows extends Context.Service<
  UserRows,
  Ref.Ref<HashMap.HashMap<string, UserRow>>
>()('@app-template/kernel/data/testing/UserRows') {
  static readonly layer = Layer.effect(this, Ref.make(HashMap.empty<string, UserRow>()))
}

const holdsWhere = (where: UserEntityWhere): Predicate.Predicate<UserRow> =>
  Predicate.and(
    pipe(
      matches<UserEntity>({ id: where.id }),
      Predicate.mapInput((row: UserRow) => row.user),
    ),
    pipe(
      matches<UserEntityCredential>({ kind: where.credential?.kind, hash: where.credential?.hash }),
      Predicate.mapInput((row: UserRow) => row.credential),
    ),
  )

const decodeUser = Schema.decodeUnknownEffect(UserEntity)

/**
 * Requires the id every caller passes, where Postgres would default it; like the primary keys,
 * dies writing nothing when a stored row holds the id or the credential.
 */
export const UserRepositoryTest = Layer.effect(
  UserRepository,
  UserRows.useSync((rows) =>
    UserRepository.of({
      insert: (insert, credential) =>
        decodeUser(insert).pipe(
          Effect.orDie,
          Effect.flatMap((user) =>
            Ref.modify(rows, (map) =>
              pipe(
                HashMap.findFirst(
                  map,
                  Predicate.or(holdsWhere({ id: user.id }), holdsWhere({ credential })),
                ),
                Option.match({
                  onNone: () => [Arr.of(user), HashMap.set(map, user.id, { user, credential })],
                  onSome: () => [Arr.empty<UserEntity>(), map],
                }),
              ),
            ),
          ),
          orDieOnNoRows('no user was inserted: its id or its credential is taken'),
        ),
      selectOne: (where) =>
        Ref.get(rows).pipe(
          Effect.map(HashMap.findFirst(holdsWhere(where))),
          Effect.map(Option.map(([, row]) => row.user)),
        ),
    }),
  ),
)
