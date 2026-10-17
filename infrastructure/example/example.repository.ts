import { Effect, HashMap, Layer, Ref } from 'effect'

import { type Example, type ExampleId, ExampleRepository } from '@app-template/domain/example'

export const ExampleRepositoryMemory = Layer.effect(
  ExampleRepository,
  Effect.map(Ref.make(HashMap.empty<ExampleId, Example>()), (examples) =>
    ExampleRepository.of({
      upsert: (example) => Ref.update(examples, HashMap.set(example.id, example)),
      selectById: (id) => Effect.map(Ref.get(examples), HashMap.get(id)),
    }),
  ),
)
