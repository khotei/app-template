import { deploymentConfig } from '#deployment/aws/config'
import { buildResourceName } from '#deployment/shared/naming'
import { buildTags } from '#deployment/shared/tags'

export const iam = {
  name: buildResourceName(deploymentConfig.stage, 'iam'),
  tags: buildTags(deploymentConfig.stage),
} as const
