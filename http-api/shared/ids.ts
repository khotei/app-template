import { Schema } from 'effect'

const buildIdSchema = <const B extends string>(brand: Parameters<typeof Schema.brand<B>>[0]) =>
  Schema.String.check(Schema.isUUID()).pipe(Schema.brand<B>(brand))

export const UserId = buildIdSchema('UserId')
export type UserId = typeof UserId.Type

export const ChatId = buildIdSchema('ChatId')
export type ChatId = typeof ChatId.Type

export const MessageId = buildIdSchema('MessageId')
export type MessageId = typeof MessageId.Type

export const AttachmentId = buildIdSchema('AttachmentId')
export type AttachmentId = typeof AttachmentId.Type
