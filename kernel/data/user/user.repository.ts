import { Context, Effect, Layer, Option } from 'effect'
import { SqlClient } from 'effect/sql'

import { orDieWithSqlError } from '@app-template/packages/db'

import { Db } from '#kernel/data/db.client'
import type {
  UserEntity,
  UserEntityCredential,
  UserEntityWhere,
} from '#kernel/data/user/user.entity'
import { credentials, users } from '#kernel/data/user/user.table'

export class UserRepository extends Context.Service<
  UserRepository,
  {
    /** Writes the user and its credential, or neither. */
    readonly insert: (user: UserEntity, credential: UserEntityCredential) => Effect.Effect<void>
    readonly selectOne: (where: UserEntityWhere) => Effect.Effect<Option.Option<UserEntity>>
  }
>()('@app-template/kernel/data/user/UserRepository', {
  make: Effect.gen(function* () {
    const db = yield* Db
    const sql = yield* SqlClient.SqlClient
    return {
      insert: Effect.fn('UserRepository.insert')(
        function* (user: UserEntity, { kind, hash }: UserEntityCredential) {
          yield* db.insert(users).values(user)
          yield* db.insert(credentials).values({ hash, kind, userId: user.id })
        },
        sql.withTransaction,
        orDieWithSqlError,
      ),
      selectOne: Effect.fn('UserRepository.selectOne')(
        (where: UserEntityWhere) => db.query.users.findFirst({ where }),
        Effect.map(Option.fromUndefinedOr),
        orDieWithSqlError,
      ),
    }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
