import { createExampleService } from '@oblik/application/example'
import { createExampleQueue, createExampleRepository } from '@oblik/infrastructure/example'
import { createExampleHandler } from './handlers/example.handler'

export const buildLayer = () => {
  const exampleService = createExampleService({ repository: createExampleRepository() })
  const queue = createExampleQueue()
  const handleExample = createExampleHandler({ exampleService })
  return {
    queue,
    async pollOnce() {
      for (const job of await queue.receive()) await handleExample(job)
    },
  }
}

export type Layer = ReturnType<typeof buildLayer>
