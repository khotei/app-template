import { Context, type DateTime, Effect, type Option, String as Str } from 'effect'

import { ExampleNameInvalidError } from '#domain/example/example.error'
import { Example, type ExampleId } from '#domain/example/example.model'

export class ExampleRepository extends Context.Service<
  ExampleRepository,
  {
    readonly upsert: (example: Example) => Effect.Effect<void>
    readonly selectById: (id: ExampleId) => Effect.Effect<Option.Option<Example>>
  }
>()('@oblik/domain/example/ExampleRepository') {}

export const buildExample = Effect.fn('buildExample')(function* (input: {
  readonly id: ExampleId
  readonly name: string
  readonly createdAt: DateTime.Utc
}) {
  const name = Str.trim(input.name)
  if (Str.isEmpty(name)) return yield* new ExampleNameInvalidError({ input: input.name })
  return new Example({ id: input.id, name, createdAt: input.createdAt })
})
