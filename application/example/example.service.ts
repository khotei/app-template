import { Context, Effect, Layer, Option } from 'effect'

import { type ExampleId, ExampleNotFoundError, ExampleRepository } from '@oblik/domain/example'

export class ExampleService extends Context.Service<ExampleService>()(
  '@oblik/application/example/ExampleService',
  {
    make: Effect.gen(function* () {
      const repository = yield* ExampleRepository

      const get = Effect.fn('ExampleService.get')(function* (id: ExampleId) {
        const example = yield* repository.selectById(id)
        if (Option.isNone(example)) return yield* new ExampleNotFoundError({ id })
        return example.value
      })

      return { get }
    }),
  },
) {
  static readonly layer = Layer.effect(this, this.make)
}
