import { buildResourceName } from '../shared/naming'
import { buildTags } from '../shared/tags'
import { deploymentConfig } from './config'

export const iam = {
  name: buildResourceName(deploymentConfig.stage, 'iam'),
  tags: buildTags(deploymentConfig.stage),
} as const
