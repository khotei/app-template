import { deploymentConfig } from '#deployment/aws/config'
import { buildResourceName } from '#deployment/shared/naming'
import { buildTags } from '#deployment/shared/tags'

export const queue = {
  name: buildResourceName(deploymentConfig.stage, 'queue'),
  tags: buildTags(deploymentConfig.stage),
} as const
