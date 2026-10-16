import { describe, expect, mock, test } from 'bun:test'

import {
  buildExample,
  type Example,
  type ExampleId,
  ExampleNotFoundError,
  type ExampleRepository,
} from '@oblik/domain/example'

import { createExampleService } from '#application/example/example.service'

const example = buildExample('First', new Date('2026-10-15T00:00:00.000Z'))

const setup = (stored?: Example) => {
  const repository = {
    upsert: mock(async (_example: Example) => {}),
    selectById: mock(async (_id: ExampleId) => stored),
  } satisfies ExampleRepository
  return { repository, service: createExampleService({ repository }) }
}

describe('createExampleService', () => {
  test('saves an example through the repository', async () => {
    const { repository, service } = setup()

    await service.save(example)

    expect(repository.upsert).toHaveBeenCalledWith(example)
  })

  test('returns the stored example by id', async () => {
    const { repository, service } = setup(example)

    expect(await service.get(example.id)).toBe(example)
    expect(repository.selectById).toHaveBeenCalledWith(example.id)
  })

  test('throws ExampleNotFoundError for an unknown id', async () => {
    const { service } = setup()

    await expect(service.get('missing' as ExampleId)).rejects.toThrow(ExampleNotFoundError)
  })
})
