import { Schema } from 'effect'

import { ExampleId } from '#domain/example/example.id'

export class Example extends Schema.Class<Example>('Example')({
  id: ExampleId,
  name: Schema.String,
  createdAt: Schema.DateTimeUtc,
}) {}
