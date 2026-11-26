import { assert, describe, it } from '@effect/vitest'
import { Effect, Option, Struct } from 'effect'

import { assertSchemaEquals } from '@app-template/packages/testing'

import { RunNotRetryableError, RunStartedError, type RunStatus } from '#chat/domain/run.model'
import { RunId } from '#chat/domain/run.util'
import { RunPolicy } from '#chat/domain/run-policy'

const id = RunId.make('0192d4e0-7b3a-7c00-8000-000000000001')

const newestAt = (status: RunStatus) => Option.some({ status })

describe('RunPolicy.ensureUnstarted', () => {
  it.effect('returns a queued Run', () =>
    Effect.gen(function* () {
      const queued = { id, status: 'queued' } as const

      assert.strictEqual(yield* RunPolicy.ensureUnstarted(queued), queued)
    }),
  )

  it.effect('refuses a generating Run with RunStartedError, naming the Run', () =>
    Effect.gen(function* () {
      const error = yield* RunPolicy.ensureUnstarted({ id, status: 'generating' }).pipe(Effect.flip)

      assert.instanceOf(error, RunStartedError)
      assert.deepStrictEqual(Struct.pick(error, ['id']), { id })
    }),
  )
})

describe('RunPolicy.ensureRetryable', () => {
  it.effect('returns a failed newest Run, the check passed as a value', () =>
    Effect.gen(function* () {
      const failed = { status: 'failed' } as const

      const newest = yield* Effect.succeed(Option.some(failed)).pipe(
        Effect.flatMap(RunPolicy.ensureRetryable),
      )

      assert.strictEqual(newest, failed)
    }),
  )

  it.effect.each([
    { name: 'no Run', newest: Option.none() },
    { name: 'a done Run', newest: newestAt('done') },
    { name: 'a queued Run', newest: newestAt('queued') },
  ])('refuses $name with RunNotRetryableError', ({ newest }) =>
    Effect.gen(function* () {
      const error = yield* RunPolicy.ensureRetryable(newest).pipe(Effect.flip)

      assertSchemaEquals(RunNotRetryableError, error, new RunNotRetryableError())
    }),
  )
})
