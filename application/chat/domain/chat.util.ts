import { Schema } from 'effect'

/** The module's one id schema: a UUID branded `brand`. */
export const buildIdSchema = <const B extends string>(
  brand: Parameters<typeof Schema.brand<B>>[0],
) => Schema.String.check(Schema.isUUID()).pipe(Schema.brand<B>(brand))

export const ChatId = buildIdSchema('ChatId')
export type ChatId = typeof ChatId.Type
