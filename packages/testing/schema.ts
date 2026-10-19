import { assert } from '@effect/vitest'
import { Schema } from 'effect'

/**
 * Asserts that two values encode to the same form through `schema`; compare errors with it.
 *
 * Bun puts its own position keys on an `Error` once the JIT compiles the code that builds it, so
 * `Equal.equals` on two equal errors fails at random; the encoded forms hold only the fields. An
 * `actual` of another class fails with the schema's encode error, not with a diff.
 */
export const assertSchemaEquals = <S extends Schema.Encoder<unknown>>(
  schema: S,
  actual: unknown,
  expected: S['Type'],
) =>
  assert.deepStrictEqual(
    Schema.encodeUnknownSync(schema)(actual),
    Schema.encodeSync(schema)(expected),
  )
