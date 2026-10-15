export const projectName = 'oblik' as const

export const buildResourceName = (stage: string, resource: string): string =>
  `${projectName}-${stage}-${resource}`
