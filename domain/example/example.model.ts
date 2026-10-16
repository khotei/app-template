import type { Id } from '#domain/shared/id'

export type ExampleId = Id<'Example'>

export interface Example {
  readonly id: ExampleId
  readonly name: string
  readonly createdAt: Date
}
