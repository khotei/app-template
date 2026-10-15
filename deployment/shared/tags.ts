import { projectName } from '#deployment/shared/naming'

export const buildTags = (stage: string): Readonly<Record<string, string>> => ({
  project: projectName,
  stage,
  managedBy: 'pulumi',
})
