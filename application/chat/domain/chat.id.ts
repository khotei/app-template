import { buildIdSchema } from '#chat/domain/id.util'

export const ChatId = buildIdSchema('ChatId')
export type ChatId = typeof ChatId.Type

export const MessageId = buildIdSchema('MessageId')
export type MessageId = typeof MessageId.Type

export const RunId = buildIdSchema('RunId')
export type RunId = typeof RunId.Type
