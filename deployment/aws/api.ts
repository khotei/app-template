import { deploymentConfig } from '#deployment/aws/config'
import { buildResourceName } from '#deployment/shared/naming'
import { buildTags } from '#deployment/shared/tags'

export const api = {
  name: buildResourceName(deploymentConfig.stage, 'api'),
  tags: buildTags(deploymentConfig.stage),
} as const
