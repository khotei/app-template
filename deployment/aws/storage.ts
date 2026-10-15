import { buildResourceName } from '../shared/naming'
import { buildTags } from '../shared/tags'
import { deploymentConfig } from './config'

export const storage = {
  name: buildResourceName(deploymentConfig.stage, 'storage'),
  tags: buildTags(deploymentConfig.stage),
} as const
