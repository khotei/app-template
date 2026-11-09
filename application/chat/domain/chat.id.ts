import { Schema } from 'effect'

export const buildIdSchema = <const B extends string>(
  brand: Parameters<typeof Schema.brand<B>>[0],
) => Schema.String.check(Schema.isUUID()).pipe(Schema.brand<B>(brand))

export const ChatId = buildIdSchema('ChatId')
export type ChatId = typeof ChatId.Type

export const MessageId = buildIdSchema('MessageId')
export type MessageId = typeof MessageId.Type

export const RunId = buildIdSchema('RunId')
export type RunId = typeof RunId.Type
