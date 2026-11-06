import { describe, it } from '@effect/vitest'
import { DateTime, Effect, Schema } from 'effect'

import { assertSchemaEquals } from '@app-template/packages/testing'

import { UserId } from '#identity/contract/user.id'
import { buildUser, User } from '#identity/domain/user.model'
import { encodeUser, UserFromEntity } from '#identity/services/user.mapper'

const user = buildUser({
  id: UserId.make('0192d4e0-7b3a-7c00-8000-000000000103'),
  createdAt: DateTime.makeUnsafe('2026-10-18T00:00:00.123Z'),
})

describe('UserFromEntity', () => {
  it.effect('encodes a user for users and reads it back', () =>
    Effect.gen(function* () {
      const row = yield* encodeUser(user)
      const read = yield* Schema.decodeUnknownEffect(UserFromEntity)(row)

      assertSchemaEquals(User, read, user)
    }),
  )
})
