import { DomainError } from '../shared/error'
import type { ExampleId } from './example.model'

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
