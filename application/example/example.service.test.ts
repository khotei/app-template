import { describe, expect, test } from 'bun:test'
import {
  buildExample,
  type Example,
  type ExampleId,
  ExampleNotFoundError,
  type ExampleRepository,
} from '@oblik/domain/example'
import { createExampleService } from './example.service'

const createMapRepository = (): ExampleRepository => {
  const examples = new Map<ExampleId, Example>()
  return {
    upsert: async (example) => void examples.set(example.id, example),
    selectById: async (id) => examples.get(id),
  }
}

describe('createExampleService', () => {
  test('returns a saved example by id', async () => {
    const service = createExampleService({ repository: createMapRepository() })
    const example = buildExample('First', new Date())

    await service.save(example)

    expect(await service.get(example.id)).toBe(example)
  })

  test('throws ExampleNotFoundError for an unknown id', async () => {
    const service = createExampleService({ repository: createMapRepository() })

    await expect(service.get('missing' as ExampleId)).rejects.toThrow(ExampleNotFoundError)
  })
})
