import { projectName } from '@app-template/aws'

export const buildTags = (stage: string): Readonly<Record<string, string>> => ({
  project: projectName,
  stage,
  managedBy: 'pulumi',
})
