import { Schema } from 'effect'

export const ChatId = Schema.String.check(Schema.isUUID()).pipe(Schema.brand('ChatId'))
export type ChatId = typeof ChatId.Type

export const MessageId = Schema.String.check(Schema.isUUID()).pipe(Schema.brand('MessageId'))
export type MessageId = typeof MessageId.Type
