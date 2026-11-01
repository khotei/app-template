import { Schema } from 'effect'

export const UserId = Schema.String.check(Schema.isUUID()).pipe(Schema.brand('UserId'))
export type UserId = typeof UserId.Type
