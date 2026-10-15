import { buildResourceName } from '../shared/naming'
import { buildTags } from '../shared/tags'
import { deploymentConfig } from './config'

export const database = {
  name: buildResourceName(deploymentConfig.stage, 'database'),
  tags: buildTags(deploymentConfig.stage),
} as const
