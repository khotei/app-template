import { buildIdSchema } from '@app-template/packages/schema'

export const ChatId = buildIdSchema('ChatId')
export type ChatId = typeof ChatId.Type

/** No NUL: Postgres's `text` refuses it. */
export const textPattern = /^[^\0]*$/u

/** The longest title, in UTF-16 code units; `chats_title_check` holds the same limit. */
export const maxTitleLength = 120
