import { createExampleService, createExampleUseCase } from '@oblik/application/example'
import { createExampleRepository } from '@oblik/infrastructure/example'

export const buildLayer = () => {
  const exampleService = createExampleService({ repository: createExampleRepository() })
  return {
    exampleService,
    createExample: createExampleUseCase({ exampleService, now: () => new Date() }),
  }
}

export type Layer = ReturnType<typeof buildLayer>
