import { Effect, Layer } from 'effect'

import { AwsConfig, MiniStackConfig } from '@app-template/config'

/** `make up` exports `.env` to the shell, since Pulumi starts the program itself. */
export const settings = Effect.all({ aws: AwsConfig, ministack: MiniStackConfig }).pipe(
  Effect.provide(Layer.mergeAll(AwsConfig.layer, MiniStackConfig.layer)),
  Effect.runSync,
)

/**
 * The local instance's credentials. They guard nothing on a developer's machine, so they are
 * fixed here rather than kept in `.env`; the apps read them back from `DATABASE_URL` in
 * `.env.pulumi`.
 */
export const localDatabase = { user: 'app', password: 'app', name: 'app_template' } as const
