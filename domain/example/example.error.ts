import { Schema } from 'effect'

import { ExampleId } from '#domain/example/example.id'

export class ExampleNameInvalidError extends Schema.TaggedError<ExampleNameInvalidError>()(
  'ExampleNameInvalidError',
  { input: Schema.String },
) {}

export class ExampleNotFoundError extends Schema.TaggedError<ExampleNotFoundError>()(
  'ExampleNotFoundError',
  { id: ExampleId },
) {}
