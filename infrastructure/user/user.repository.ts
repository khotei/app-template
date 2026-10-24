import { Effect, Layer, Option, Schema } from 'effect'
import { KeyValueStore } from 'effect/persistence'
import { SqlClient } from 'effect/sql'

import { type Credential, User, UserId, UserRepository } from '@app-template/domain/user'

import { Db, decodeFound, orDieWithSqlError } from '#infrastructure/db/db.client'
import { createCollection } from '#infrastructure/kv/kv-collection'
import { credentials, decodeUser, UserInsert, users } from '#infrastructure/user/user.entity'

const credentialKey = (credential: Credential) => `${credential.kind}/${credential.hash}`

export const UserRepositoryKv = Layer.effect(
  UserRepository,
  Effect.map(KeyValueStore.KeyValueStore, (store) => {
    const users = createCollection(store, { prefix: 'users/', schema: User })
    const credentials = createCollection(store, { prefix: 'credentials/', schema: UserId })
    return UserRepository.of({
      insert: Effect.fn('UserRepository.insert')(function* (user, credential) {
        yield* users.set(user.id, user)
        yield* credentials.set(credentialKey(credential), user.id)
      }),
      selectById: Effect.fn('UserRepository.selectById')(users.get),
      selectByCredential: Effect.fn('UserRepository.selectByCredential')((credential: Credential) =>
        Effect.flatMap(
          credentials.get(credentialKey(credential)),
          Option.match({ onNone: () => Effect.succeedNone, onSome: users.get }),
        ),
      ),
    })
  }),
)

const encodeUser = Schema.encodeEffect(UserInsert)

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
        return yield* decodeFound(row, decodeUser)
      }, orDieWithSqlError),
      selectByCredential: Effect.fn('UserRepository.selectByCredential')(function* (credential) {
        const row = yield* db.query.users.findFirst({
          where: { credentials: { kind: credential.kind, hash: credential.hash } },
        })
        return yield* decodeFound(row, decodeUser)
      }, orDieWithSqlError),
    })
  }),
)
