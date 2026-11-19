import { pipe, String as Str } from 'effect'

import { buildIdSchema } from '#chat/domain/chat.util'

export const MessageId = buildIdSchema('MessageId')
export type MessageId = typeof MessageId.Type

export const isBlank = (text: string) => pipe(text, Str.trim, Str.isEmpty)
