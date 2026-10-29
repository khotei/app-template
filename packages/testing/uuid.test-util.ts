import { Schema } from 'effect'

export const isUuidV7 = Schema.is(Schema.String.check(Schema.isUUID(7)))
