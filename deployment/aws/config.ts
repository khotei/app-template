import { Effect } from 'effect'

import { AwsConfig, DatabaseConfig } from '@app-template/config'

export const deploymentConfig: AwsConfig['Service'] = Effect.runSync(
  Effect.provide(AwsConfig, AwsConfig.layer),
)

export const databaseConfig: DatabaseConfig['Service'] = Effect.runSync(
  Effect.provide(DatabaseConfig, DatabaseConfig.layer),
)
