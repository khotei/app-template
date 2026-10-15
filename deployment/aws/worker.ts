import { buildResourceName } from '../shared/naming'
import { buildTags } from '../shared/tags'
import { deploymentConfig } from './config'

export const worker = {
  name: buildResourceName(deploymentConfig.stage, 'worker'),
  tags: buildTags(deploymentConfig.stage),
} as const
