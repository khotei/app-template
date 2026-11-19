import { buildIdSchema } from '@app-template/packages/schema'

export const RunId = buildIdSchema('RunId')
export type RunId = typeof RunId.Type
