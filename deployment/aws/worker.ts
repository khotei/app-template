import { deploymentConfig } from '#deployment/aws/config'
import { buildResourceName } from '#deployment/shared/naming'
import { buildTags } from '#deployment/shared/tags'

export const worker = {
  name: buildResourceName(deploymentConfig.stage, 'worker'),
  tags: buildTags(deploymentConfig.stage),
} as const
