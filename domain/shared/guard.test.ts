import { assert, describe, it } from '@effect/vitest'
import { Effect, Option } from 'effect'

import { assertSchemaEquals } from '@app-template/testing'

import { ChatNotFoundError } from '#domain/chat/chat.error'
import { ChatId } from '#domain/chat/chat.id'
import { ensureFound } from '#domain/shared/guard'
import { UserId } from '#domain/user/user.id'
import { isOwnedBy } from '#domain/user/user.service'

const userId = UserId.make('0192d4e0-7b3a-7c00-8000-000000000010')
const id = ChatId.make('0192d4e0-7b3a-7c00-8000-000000000040')
const owned = { id, userId }
const foreign = { id, userId: UserId.make('0192d4e0-7b3a-7c00-8000-000000000011') }
const missing = () => new ChatNotFoundError({ id })

describe('ensureFound', () => {
  it.effect('returns the record found when the predicate holds for it', () =>
    Effect.gen(function* () {
      const record = yield* ensureFound(Option.some(owned), isOwnedBy(userId), missing)

      assert.strictEqual(record, owned)
    }),
  )

  it.effect.each([
    ['nothing was found', Option.none()],
    ["another user's record was found", Option.some(foreign)],
  ] as const)('fails the missing error when %s', ([, found]) =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(ensureFound(found, isOwnedBy(userId), missing))

      assertSchemaEquals(ChatNotFoundError, error, new ChatNotFoundError({ id }))
    }),
  )
})
