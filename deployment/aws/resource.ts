import { deploymentConfig } from '#deployment/aws/config'
import { buildResourceName } from '#deployment/shared/naming'
import { buildTags } from '#deployment/shared/tags'

export interface Resource {
  readonly name: string
  readonly tags: Readonly<Record<string, string>>
}

export const buildResource = (resource: string): Resource => ({
  name: buildResourceName(deploymentConfig.stage, resource),
  tags: buildTags(deploymentConfig.stage),
})
