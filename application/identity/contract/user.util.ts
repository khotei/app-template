import { buildIdSchema } from '@app-template/packages/schema'

export const UserId = buildIdSchema('UserId')
export type UserId = typeof UserId.Type
