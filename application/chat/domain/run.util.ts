import { buildIdSchema } from '#chat/domain/chat.util'

export const RunId = buildIdSchema('RunId')
export type RunId = typeof RunId.Type
