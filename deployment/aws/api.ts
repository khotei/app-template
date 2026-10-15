import { buildResourceName } from '../shared/naming'
import { buildTags } from '../shared/tags'
import { deploymentConfig } from './config'

export const api = {
  name: buildResourceName(deploymentConfig.stage, 'api'),
  tags: buildTags(deploymentConfig.stage),
} as const
