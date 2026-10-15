import { deploymentConfig } from '#deployment/aws/config'
import { buildResourceName } from '#deployment/shared/naming'
import { buildTags } from '#deployment/shared/tags'

export const storage = {
  name: buildResourceName(deploymentConfig.stage, 'storage'),
  tags: buildTags(deploymentConfig.stage),
} as const
