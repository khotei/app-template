import { and, eq, getColumns } from 'drizzle-orm'
import { Array as Arr, Effect, Layer, Option, Schema } from 'effect'
import { KeyValueStore } from 'effect/persistence'
import { SqlClient } from 'effect/sql'

import { type Credential, User, UserId, UserRepository } from '@app-template/domain/user'

import { Db, unwrapQueryError } from '#infrastructure/db/db.client'
import { createCollection } from '#infrastructure/kv/kv-collection'
import { credentials, UserInsert, UserRow, users } from '#infrastructure/user/user.entity'

export const credentialsPrefix = 'credentials/'

export const credentialKey = (credential: Credential) => `${credential.kind}/${credential.hash}`

export const UserRepositoryKv = Layer.effect(
  UserRepository,
  Effect.map(KeyValueStore.KeyValueStore, (store) => {
    const users = createCollection(store, { prefix: 'users/', schema: User })
    const credentials = createCollection(store, { prefix: credentialsPrefix, schema: UserId })
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
const decodeUser = Schema.decodeEffect(UserRow)

const decodeFirstUser = Effect.fnUntraced(function* (rows: ReadonlyArray<typeof UserRow.Encoded>) {
  const decodedRow = yield* Effect.transposeOption(Option.map(Arr.head(rows), decodeUser))
  return Option.map(decodedRow, (fields) => new User(fields))
})

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
        Effect.catchTag('EffectDrizzleQueryError', unwrapQueryError),
        Effect.orDie,
      ),
      selectById: Effect.fn('UserRepository.selectById')(
        function* (id) {
          const rows = yield* db.select().from(users).where(eq(users.id, id))
          return yield* decodeFirstUser(rows)
        },
        Effect.catchTag('EffectDrizzleQueryError', unwrapQueryError),
        Effect.orDie,
      ),
      selectByCredential: Effect.fn('UserRepository.selectByCredential')(
        function* (credential) {
          const rows = yield* db
            .select(getColumns(users))
            .from(credentials)
            .innerJoin(users, eq(users.id, credentials.userId))
            .where(
              and(eq(credentials.kind, credential.kind), eq(credentials.hash, credential.hash)),
            )
          return yield* decodeFirstUser(rows)
        },
        Effect.catchTag('EffectDrizzleQueryError', unwrapQueryError),
        Effect.orDie,
      ),
    })
  }),
)
