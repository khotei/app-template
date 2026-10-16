import type { Example, ExampleId, ExampleRepository } from '@oblik/domain/example'

export const createExampleRepository = (): ExampleRepository => {
  const examples = new Map<ExampleId, Example>()
  return {
    async upsert(example) {
      examples.set(example.id, example)
    },
    async selectById(id) {
      return examples.get(id)
    },
  }
}
