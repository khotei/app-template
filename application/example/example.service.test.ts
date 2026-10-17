import { assert, describe, it } from '@effect/vitest'
import { DateTime, Effect, Layer } from 'effect'

import { buildExample, ExampleId, ExampleRepository } from '@oblik/domain/example'
import { ExampleRepositoryMemory } from '@oblik/infrastructure/example'

import { ExampleService } from '#application/example/example.service'

const ExampleServiceTest = ExampleService.layer.pipe(Layer.provideMerge(ExampleRepositoryMemory))

describe('ExampleService', () => {
  it.effect('returns an example upserted through the repository', () =>
    Effect.gen(function* () {
      const example = yield* buildExample({
        id: ExampleId.make('0192d4e0-7b3a-7c00-8000-000000000001'),
        name: 'First',
        createdAt: DateTime.makeUnsafe('2026-10-15T00:00:00.000Z'),
      })
      yield* (yield* ExampleRepository).upsert(example)

      assert.deepStrictEqual(yield* (yield* ExampleService).get(example.id), example)
    }).pipe(Effect.provide(ExampleServiceTest)),
  )

  it.effect('fails with ExampleNotFoundError for an unknown id', () =>
    Effect.gen(function* () {
      const id = ExampleId.make('0192d4e0-7b3a-7c00-8000-000000000001')

      const error = yield* Effect.flip((yield* ExampleService).get(id))

      assert.strictEqual(error._tag, 'ExampleNotFoundError')
      assert.strictEqual(error.id, id)
    }).pipe(Effect.provide(ExampleServiceTest)),
  )
})
