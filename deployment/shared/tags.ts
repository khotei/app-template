import { ResourceName } from '@app-template/kernel/aws'

export const buildTags = (stage: string): Readonly<Record<string, string>> => ({
  project: ResourceName.project,
  stage,
  managedBy: 'pulumi',
})
