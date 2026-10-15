import { deploymentConfig } from '#deployment/aws/config'
import { buildResourceName } from '#deployment/shared/naming'
import { buildTags } from '#deployment/shared/tags'

export const database = {
  name: buildResourceName(deploymentConfig.stage, 'database'),
  tags: buildTags(deploymentConfig.stage),
} as const
