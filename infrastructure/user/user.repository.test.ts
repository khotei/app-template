import { assert, describe, layer } from '@effect/vitest'
import { DateTime, Effect, Layer, Option } from 'effect'
import { KeyValueStore } from 'effect/persistence'

import {
  buildUser,
  Credential,
  SecretHash,
  UserId,
  UserRepository,
} from '@app-template/domain/user'

import { UserRepositoryKv } from '#infrastructure/user/user.repository'

const createdAt = DateTime.makeUnsafe('2026-10-18T00:00:00.000Z')

const user = (id: string) => buildUser({ id: UserId.make(id), createdAt })

const credential = (hex: string) =>
  new Credential({ kind: 'secret', hash: SecretHash.make(hex.repeat(64)) })

describe('UserRepositoryKv', () => {
  layer(UserRepositoryKv.pipe(Layer.provideMerge(KeyValueStore.layerMemory)))((it) => {
    it.effect('finds an inserted user by its credential, keyed by the hash alone', () =>
      Effect.gen(function* () {
        const users = yield* UserRepository
        const ada = user('0192d4e0-7b3a-7c00-8000-000000000010')

        yield* users.insert(ada, credential('a'))

        assert.deepStrictEqual(yield* users.selectByCredential(credential('a')), Option.some(ada))
        assert.deepStrictEqual(yield* users.selectById(ada.id), Option.some(ada))
        assert.strictEqual(
          yield* (yield* KeyValueStore.KeyValueStore).get(`credentials/secret/${'a'.repeat(64)}`),
          JSON.stringify(ada.id),
        )
      }),
    )

    it.effect('selects none for an unknown credential or id', () =>
      Effect.gen(function* () {
        const users = yield* UserRepository

        assert.deepStrictEqual(yield* users.selectByCredential(credential('b')), Option.none())
        assert.deepStrictEqual(
          yield* users.selectById(UserId.make('0192d4e0-7b3a-7c00-8000-000000000019')),
          Option.none(),
        )
      }),
    )
  })
})
