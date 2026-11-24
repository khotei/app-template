import { Context, Effect, Layer, type Option, Schema } from 'effect'
import { SqlClient, SqlModel, SqlSchema } from 'effect/sql'

import { User } from '#identity/domain/user.model'

/** A credential as `credentials` holds it, its user's id aside. */
export const UserCredential = Schema.Struct({
  kind: Schema.Literals(['secret']),
  hash: Schema.String,
})
export type UserCredential = typeof UserCredential.Type

export class UserRepository extends Context.Service<
  UserRepository,
  {
    /** Writes the user and its credential, or neither. */
    readonly insert: (
      user: typeof User.insert.Type,
      credential: UserCredential,
    ) => Effect.Effect<void>
    /** Returns the user holding `credential`, among any it holds. */
    readonly selectOne: (credential: UserCredential) => Effect.Effect<Option.Option<User>>
  }
>()('@app-template/application/identity/services/UserRepository', {
  make: Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const table = yield* SqlModel.makeRepository(User, {
      tableName: 'users',
      spanPrefix: 'UserRepository',
      idColumn: 'id',
    })

    const findByCredential = SqlSchema.findOneOption({
      Request: UserCredential,
      Result: User,
      execute: ({ kind, hash }) => sql`
        select users.* from users
        where exists (
          select 1 from credentials
          where credentials.user_id = users.id
            and credentials.kind = ${kind}
            and credentials.hash = ${hash}
        )
        limit 1`,
    })

    return {
      insert: Effect.fn('UserRepository.insert')(
        function* (user: typeof User.insert.Type, credential: UserCredential) {
          yield* table.insertVoid(user)
          yield* sql`insert into credentials ${sql.insert({ ...credential, userId: user.id })}`
        },
        sql.withTransaction,
        Effect.orDie,
      ),
      selectOne: Effect.fn('UserRepository.selectOne')(findByCredential, Effect.orDie),
    }
  }),
}) {
  static readonly layer = Layer.effect(this, this.make)
}
