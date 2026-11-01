import { Effect, flow, Layer, Schema, UndefinedOr } from 'effect'
import { SqlClient } from 'effect/sql'

import { decodeOptionalRow, orDieWithSqlError, skipUndefined } from '@app-template/db'
import { UserRepository, type UserWhere } from '@app-template/identity/domain'
import { Db } from '@app-template/kernel/data'
import { credentials, UserEntityInsert, users } from '@app-template/kernel/data/user'

import { UserFromEntity } from '#infrastructure/user/user.mapper'

const encodeUser = flow(
  Schema.encodeEffect(UserFromEntity),
  Effect.flatMap(Schema.decodeEffect(UserEntityInsert)),
)

/** The credential is a filter on the relation, so a user is found by any credential it holds. */
const filterOf = (where: UserWhere) =>
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
            .pipe(Effect.flatMap(decodeOptionalRow(UserFromEntity))),
        orDieWithSqlError,
      ),
    })
  }),
)
