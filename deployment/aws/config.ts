export interface DeploymentConfig {
  readonly stage: string
  readonly region: string
}

export const deploymentConfig: DeploymentConfig = { stage: 'dev', region: 'eu-central-1' }
