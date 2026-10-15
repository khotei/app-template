import { buildResourceName } from '../shared/naming'
import { buildTags } from '../shared/tags'
import { deploymentConfig } from './config'

export const web = {
  name: buildResourceName(deploymentConfig.stage, 'web'),
  tags: buildTags(deploymentConfig.stage),
} as const
