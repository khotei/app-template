import { assert, describe, it } from '@effect/vitest'
import { Effect, Equal, Option, Schema } from 'effect'

import { encodeWith } from '@app-template/packages/schema'
import { epoch } from '@app-template/packages/testing'

import { UserId } from '#identity/contract/user.util'
import { User } from '#identity/domain/user.model'

const user = new User({ id: UserId.make('0192d4e0-7b3a-7c00-8000-000000000010'), createdAt: epoch })

describe('User', () => {
  it.effect('decodes the row it reads into a User, and dies on a row that does not decode', () =>
    Effect.gen(function* () {
      const row = yield* encodeWith(User)(user)

      const one = yield* User.decodeOne(Option.some(row))
      const defect = yield* User.decodeOne(Option.some({ ...row, id: 'not-a-uuid' })).pipe(
        Effect.catchDefect(Effect.succeed),
      )

      assert.instanceOf(Option.getOrThrow(one), User)
      assert.isTrue(Equal.equals(Option.getOrThrow(one), user))
      assert.isTrue(Schema.isSchemaError(defect))
    }),
  )
})
