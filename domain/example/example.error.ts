import type { ExampleId } from '#domain/example/example.model'
import { DomainError } from '#domain/shared/error'

export class ExampleNameInvalidError extends DomainError {
  readonly _tag = 'ExampleNameInvalidError'

  constructor(readonly input: string) {
    super(`Example name must not be blank, got ${JSON.stringify(input)}`)
  }
}

export class ExampleNotFoundError extends DomainError {
  readonly _tag = 'ExampleNotFoundError'

  constructor(readonly id: ExampleId) {
    super(`Example ${id} not found`)
  }
}
