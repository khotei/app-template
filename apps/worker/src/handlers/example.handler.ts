import type { ExampleService } from '@oblik/application/example'
import type { ExampleJob } from '@oblik/infrastructure/example'

export const createExampleHandler =
  (deps: { exampleService: ExampleService }) =>
  async (job: ExampleJob): Promise<void> => {
    const example = await deps.exampleService.get(job.exampleId)
    console.log(`processed example ${example.id} (${example.name})`)
  }
