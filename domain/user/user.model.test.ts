import { assert, describe, it } from '@effect/vitest'
import { Schema } from 'effect'

import { SecretHash } from '#domain/user/user.model'

const hash = '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08'

describe('SecretHash', () => {
  it('accepts a lower-case 64-character hex string', () => {
    assert.isTrue(Schema.is(SecretHash)(hash))
  })

  it.each([
    ['upper-case hex', hash.toUpperCase()],
    ['63 hex characters', hash.slice(1)],
    ['a base64url 32-byte secret', 'q3Jx0V8m2bZ9yT_4kW-1sN7uP5oA6dLcE0fG8hI2jK4'],
  ])('rejects %s', (_, value) => {
    assert.isFalse(Schema.is(SecretHash)(value))
  })
})
