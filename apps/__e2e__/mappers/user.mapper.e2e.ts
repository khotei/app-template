import { describe, it } from '@effect/vitest'
import { DateTime, Effect, Layer, Option, Schema } from 'effect'

import {
  buildUser,
  Credential,
  SecretHash,
  User,
  UserRepository,
} from '@app-template/identity/domain'
import { UserId } from '@app-template/identity-contract'
import { UserPg } from '@app-template/infrastructure/user'
import { DbTest } from '@app-template/kernel/testing-e2e'
import { assertSchemaEquals } from '@app-template/testing'

const user = buildUser({
  id: UserId.make('0192d4e0-7b3a-7c00-8000-000000000103'),
  createdAt: DateTime.makeUnsafe('2026-10-18T00:00:00.123Z'),
})

// Every hex digit, at the pattern's length.
const credential = new Credential({
  kind: 'secret',
  hash: SecretHash.make('0123456789abcdef'.repeat(4)),
})

const UserPgTest = UserPg.pipe(Layer.provide(DbTest))

describe('a credential hash on Postgres', () => {
  it.effect('writes a credential hash of every allowed character and reads its user back', () =>
    Effect.gen(function* () {
      const users = yield* UserRepository

      yield* users.insert(user, credential)
      const selected = yield* users.selectOne({ credential })

      assertSchemaEquals(Schema.Option(User), selected, Option.some(user))
    }).pipe(Effect.provide(UserPgTest)),
  )
})
