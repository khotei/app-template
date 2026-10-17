import { Config, Context, Duration, Effect, Layer, type LogLevel, References, Schema } from 'effect'

export class ApiConfig extends Context.Service<ApiConfig, { readonly port: number }>()(
  '@app-template/config/ApiConfig',
) {
  static readonly layer = Layer.effect(this, Config.all({ port: Config.Port('API_PORT') }))
}

export class WebConfig extends Context.Service<WebConfig, { readonly port: number }>()(
  '@app-template/config/WebConfig',
) {
  static readonly layer = Layer.effect(this, Config.all({ port: Config.Port('WEB_PORT') }))
}

const nodeEnvs = ['development', 'test', 'production'] as const

export class RuntimeConfig extends Context.Service<
  RuntimeConfig,
  { readonly nodeEnv: (typeof nodeEnvs)[number]; readonly logLevel: LogLevel.LogLevel }
>()('@app-template/config/RuntimeConfig') {
  static readonly layer = Layer.effect(
    this,
    Config.all({
      nodeEnv: Config.Literals(nodeEnvs, 'NODE_ENV').pipe(Config.withDefault('development')),
      logLevel: Config.LogLevel('LOG_LEVEL').pipe(Config.withDefault('Info')),
    }),
  )
}

export class QueueLockRefreshIntervalInvalidError extends Schema.TaggedError<QueueLockRefreshIntervalInvalidError>()(
  'QueueLockRefreshIntervalInvalidError',
  { lockExpiration: Schema.Duration, lockRefreshInterval: Schema.Duration },
) {
  override get message(): string {
    return `QUEUE_LOCK_REFRESH_INTERVAL (${Duration.format(this.lockRefreshInterval)}) must be shorter than QUEUE_LOCK_EXPIRATION (${Duration.format(this.lockExpiration)})`
  }
}

export class QueueConfig extends Context.Service<
  QueueConfig,
  {
    readonly filename: string
    readonly lockExpiration: Duration.Duration
    readonly lockRefreshInterval: Duration.Duration
  }
>()('@app-template/config/QueueConfig') {
  static readonly layer = Layer.effect(
    this,
    Config.all({
      filename: Config.String('QUEUE_SQLITE_PATH'),
      lockExpiration: Config.Duration('QUEUE_LOCK_EXPIRATION').pipe(
        Config.withDefault(Duration.seconds(15)),
      ),
      lockRefreshInterval: Config.Duration('QUEUE_LOCK_REFRESH_INTERVAL').pipe(
        Config.withDefault(Duration.seconds(5)),
      ),
    }).pipe(
      Effect.filterOrFail(
        ({ lockExpiration, lockRefreshInterval }) =>
          Duration.isLessThan(lockRefreshInterval, lockExpiration),
        ({ lockExpiration, lockRefreshInterval }) =>
          new QueueLockRefreshIntervalInvalidError({ lockExpiration, lockRefreshInterval }),
      ),
    ),
  )
}

export const MinimumLogLevelFromConfig = Layer.effect(
  References.MinimumLogLevel,
  Effect.map(RuntimeConfig, (config) => config.logLevel),
).pipe(Layer.provide(RuntimeConfig.layer))
