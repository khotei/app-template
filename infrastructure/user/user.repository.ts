import { Effect, Layer, Schema } from 'effect'
import { SqlClient } from 'effect/sql'

import { UserRepository } from '@app-template/domain/user'

import { Db, orDieWithSqlError } from '#infrastructure/db/db.client'
import { credentials, UserFromRow, UserInsert, users } from '#infrastructure/user/user.entity'

const encodeUser = Schema.encodeEffect(UserInsert)

const decodeOptionalUser = Schema.decodeEffect(Schema.OptionFromUndefinedOr(UserFromRow))

export const UserRepositoryPg = Layer.effect(
  UserRepository,
  Effect.gen(function* () {
    const db = yield* Db
    const sql = yield* SqlClient.SqlClient
    return UserRepository.of({
      insert: Effect.fn('UserRepository.insert')(
        function* (user, credential) {
          const row = yield* encodeUser(user)

          yield* db.insert(users).values(row)
          yield* db
            .insert(credentials)
            .values({ hash: credential.hash, kind: credential.kind, userId: user.id })
        },
        sql.withTransaction,
        orDieWithSqlError,
      ),
      selectById: Effect.fn('UserRepository.selectById')(function* (id) {
        const row = yield* db.query.users.findFirst({ where: { id } })
        return yield* decodeOptionalUser(row)
      }, orDieWithSqlError),
      selectByCredential: Effect.fn('UserRepository.selectByCredential')(function* (credential) {
        const row = yield* db.query.users.findFirst({
          where: { credentials: { kind: credential.kind, hash: credential.hash } },
        })
        return yield* decodeOptionalUser(row)
      }, orDieWithSqlError),
    })
  }),
)
