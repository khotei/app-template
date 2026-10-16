import { describe, expect, test, vi } from 'vitest'

import {
  type Example,
  ExampleNameInvalidError,
  type ExampleRepository,
} from '@oblik/domain/example'

import { createExampleUseCase } from '#application/example/create.use-case'
import { createExampleService } from '#application/example/example.service'

const now = new Date('2026-10-15T00:00:00.000Z')

const setup = () => {
  const repository = {
    upsert: vi.fn(async (_example: Example) => {}),
    selectById: vi.fn(async () => undefined),
  } satisfies ExampleRepository
  const exampleService = createExampleService({ repository })
  const createExample = createExampleUseCase({ exampleService, now: () => now })
  return { repository, createExample }
}

describe('createExampleUseCase', () => {
  test('builds an example with the injected clock, saves it once and returns it', async () => {
    const { repository, createExample } = setup()

    const example = await createExample({ name: 'First' })

    expect(example.name).toBe('First')
    expect(example.createdAt).toBe(now)
    expect(repository.upsert).toHaveBeenCalledTimes(1)
    expect(repository.upsert).toHaveBeenCalledWith(example)
  })

  test('propagates ExampleNameInvalidError and saves nothing', async () => {
    const { repository, createExample } = setup()

    await expect(createExample({ name: '  ' })).rejects.toThrow(ExampleNameInvalidError)
    expect(repository.upsert).not.toHaveBeenCalled()
  })
})
