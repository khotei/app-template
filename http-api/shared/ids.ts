import { Schema } from 'effect'

export const UserId = Schema.String.check(Schema.isUUID()).pipe(Schema.brand('UserId'))
export type UserId = typeof UserId.Type

export const ChatId = Schema.String.check(Schema.isUUID()).pipe(Schema.brand('ChatId'))
export type ChatId = typeof ChatId.Type

export const MessageId = Schema.String.check(Schema.isUUID()).pipe(Schema.brand('MessageId'))
export type MessageId = typeof MessageId.Type

export const AttachmentId = Schema.String.check(Schema.isUUID()).pipe(Schema.brand('AttachmentId'))
export type AttachmentId = typeof AttachmentId.Type

export const RunId = Schema.String.check(Schema.isUUID()).pipe(Schema.brand('RunId'))
export type RunId = typeof RunId.Type
