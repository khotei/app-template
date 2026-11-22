import { buildIdSchema } from '@app-template/packages/schema'

export const ChatId = buildIdSchema('ChatId')
export type ChatId = typeof ChatId.Type
