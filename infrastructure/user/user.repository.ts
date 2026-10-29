import { Effect, Layer, Schema, UndefinedOr } from 'effect'
import { SqlClient } from 'effect/sql'

import { type UserOneWhere, UserRepository } from '@app-template/domain/user'

import { skipUndefined } from '#infrastructure/db/columns'
import { Db, decodeOptionalRow, orDieWithSqlError } from '#infrastructure/db/db.client'
import { credentials, UserFromRow, UserInsert, users } from '#infrastructure/user/user.entity'

const encodeUser = Schema.encodeEffect(UserInsert)

/** The credential is a filter on the relation, so a user is found by any credential it holds. */
const filterOf = (where: UserOneWhere) =>
  ({
    id: skipUndefined(where.id),
    credentials: skipUndefined(
      UndefinedOr.map(where.credential, ({ kind, hash }) => ({ kind, hash })),
    ),
  }) as const

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
      selectOne: Effect.fn('UserRepository.selectOne')(
        (where) =>
          db.query.users
            .findFirst({ where: filterOf(where) })
            .pipe(Effect.flatMap(decodeOptionalRow(UserFromRow))),
        orDieWithSqlError,
      ),
    })
  }),
)
