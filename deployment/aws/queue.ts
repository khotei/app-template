import { buildResourceName } from '../shared/naming'
import { buildTags } from '../shared/tags'
import { deploymentConfig } from './config'

export const queue = {
  name: buildResourceName(deploymentConfig.stage, 'queue'),
  tags: buildTags(deploymentConfig.stage),
} as const
