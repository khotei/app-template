export const projectName = 'app-template' as const

export const buildResourceName = (stage: string, resource: string): string =>
  `${projectName}-${stage}-${resource}`
