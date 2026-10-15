import {
  type Example,
  type ExampleId,
  ExampleNotFoundError,
  type ExampleRepository,
} from '@oblik/domain/example'

export interface ExampleService {
  get(id: ExampleId): Promise<Example>
  save(example: Example): Promise<void>
}

export const createExampleService = (deps: { repository: ExampleRepository }): ExampleService => ({
  async get(id) {
    const example = await deps.repository.selectById(id)
    if (example === undefined) throw new ExampleNotFoundError(id)
    return example
  },
  save: (example) => deps.repository.upsert(example),
})
