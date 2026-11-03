import { Array as Arr, Context, Effect, Layer, type Option } from 'effect'
import { SqlClient } from 'effect/sql'

import { decodeOptionalRow, orDieWithSqlError, skipUndefined } from '@app-template/packages/db'

import { Db } from '#kernel/data/db.client'
import {
  UserEntity,
  type UserEntityCredential,
  type UserEntityInsert,
  type UserEntityWhere,
} from '#kernel/data/user/user.entity'
import { credentials, users } from '#kernel/data/user/user.table'

/** The credential is a filter on the relation, so a user is found by any credential it holds. */
const filterOf = (where: UserEntityWhere) =>
  ({
    id: skipUndefined(where.id),
    credentials: skipUndefined(where.credential),
  }) as const

export class UserRepository extends Context.Service<
  UserRepository,
  {
    /** Writes the user and its credential, or neither. */
    readonly insert: (
      user: typeof UserEntityInsert.Type,
      credential: UserEntityCredential,
    ) => Effect.Effect<void>
    readonly selectOne: (where: UserEntityWhere) => Effect.Effect<Option.Option<UserEntity>>
  }
>()('@app-template/kernel/data/user/UserRepository', {
  make: Effect.gen(function* () {
    const db = yield* Db
    const sql = yield* SqlClient.SqlClient
    return {
      insert: Effect.fn('UserRepository.insert')(
        function* (user: typeof UserEntityInsert.Type, { kind, hash }: UserEntityCredential) {
          const inserted = yield* db.insert(users).values(user).returning({ userId: users.id })
          yield* db
            .insert(credentials)
            .values(Arr.map(inserted, ({ userId }) => ({ hash, kind, userId })))
        },
        sql.withTransaction,
        orDieWithSqlError,
      ),
      selectOne: Effect.fn('UserRepository.selectOne')(
        (where: UserEntityWhere) =>
          db.query.users
            .findFirst({ where: filterOf(where) })
            .pipe(Effect.flatMap(decodeOptionalRow(UserEntity))),
        orDieWithSqlError,
      ),
    }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
