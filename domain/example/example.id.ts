import { Schema } from 'effect'

export const ExampleId = Schema.String.check(Schema.isUUID()).pipe(Schema.brand('ExampleId'))
export type ExampleId = typeof ExampleId.Type
