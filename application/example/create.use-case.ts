import { buildExample, type Example } from '@oblik/domain/example'

import type { ExampleService } from '#application/example/example.service'

export interface CreateExampleInput {
  readonly name: string
}

export const createExampleUseCase =
  (deps: { exampleService: ExampleService; now: () => Date }) =>
  async (input: CreateExampleInput): Promise<Example> => {
    const example = buildExample(input.name, deps.now())
    await deps.exampleService.save(example)
    return example
  }
