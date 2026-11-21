import { Config, Effect } from 'effect'

import { awsConfig, rdsBasePort, telemetryConfig, workerPort } from '@app-template/kernel/config'

export const settings = Config.all({
  aws: awsConfig,
  rdsBasePort,
  telemetry: telemetryConfig,
  workerPort,
}).pipe(Effect.runSync)

/**
 * The local instance's credentials. They guard nothing on a developer's machine, so they are
 * fixed here rather than kept in `.env`.
 */
export const localDatabase = { user: 'app', password: 'app', name: 'app_template' } as const
