import { Context, Effect, Layer, Option } from 'effect'

import { orDieWithSqlError } from '@app-template/packages/db'

import { Db } from '#kernel/data/db.client'
import type { UserEntity, UserEntityWhere } from '#kernel/data/user/user.entity'
import { type CredentialColumns, credentials, users } from '#kernel/data/user/user.table'

export class UserRepository extends Context.Service<
  UserRepository,
  {
    /** A user is never stored without its credential: its caller commits both in one transaction. */
    readonly insert: (user: UserEntity) => Effect.Effect<void>
    readonly insertCredential: (credential: CredentialColumns) => Effect.Effect<void>
    readonly selectOne: (where: UserEntityWhere) => Effect.Effect<Option.Option<UserEntity>>
  }
>()('@app-template/kernel/data/user/UserRepository', {
  make: Effect.gen(function* () {
    const db = yield* Db
    return {
      insert: Effect.fn('UserRepository.insert')(
        (user: UserEntity) => db.insert(users).values(user),
        orDieWithSqlError,
      ),
      insertCredential: Effect.fn('UserRepository.insertCredential')(
        (credential: CredentialColumns) => db.insert(credentials).values(credential),
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
