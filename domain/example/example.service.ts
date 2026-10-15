import { ExampleNameInvalidError } from '#domain/example/example.error'
import type { Example, ExampleId } from '#domain/example/example.model'
import { buildId } from '#domain/shared/id'

export interface ExampleRepository {
  upsert(example: Example): Promise<void>
  selectById(id: ExampleId): Promise<Example | undefined>
}

export const buildExample = (name: string, now: Date): Example => {
  const trimmed = name.trim()
  if (trimmed === '') throw new ExampleNameInvalidError(name)
  return { id: buildId<'Example'>(), name: trimmed, createdAt: now }
}
