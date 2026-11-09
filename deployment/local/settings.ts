import { Effect, Layer } from 'effect'

import { AwsConfig, MiniStackConfig, WorkerConfig } from '@app-template/kernel/config'

export const settings = Effect.all({
  aws: AwsConfig,
  ministack: MiniStackConfig,
  worker: WorkerConfig,
}).pipe(
  Effect.provide(Layer.mergeAll(AwsConfig.layer, MiniStackConfig.layer, WorkerConfig.layer)),
  Effect.runSync,
)

/**
 * The local instance's credentials. They guard nothing on a developer's machine, so they are
 * fixed here rather than kept in `.env`.
 */
export const localDatabase = { user: 'app', password: 'app', name: 'app_template' } as const
