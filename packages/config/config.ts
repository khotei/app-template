import { Config, Context, Duration, Effect, Layer, type LogLevel, References } from 'effect'

export class ApiConfig extends Context.Service<ApiConfig, { readonly port: number }>()(
  '@oblik/config/ApiConfig',
) {
  static readonly layer = Layer.effect(this, Config.all({ port: Config.Port('API_PORT') }))
}

export class WebConfig extends Context.Service<WebConfig, { readonly port: number }>()(
  '@oblik/config/WebConfig',
) {
  static readonly layer = Layer.effect(this, Config.all({ port: Config.Port('WEB_PORT') }))
}

const nodeEnvs = ['development', 'test', 'production'] as const

export class RuntimeConfig extends Context.Service<
  RuntimeConfig,
  { readonly nodeEnv: (typeof nodeEnvs)[number]; readonly logLevel: LogLevel.LogLevel }
>()('@oblik/config/RuntimeConfig') {
  static readonly layer = Layer.effect(
    this,
    Config.all({
      nodeEnv: Config.Literals(nodeEnvs, 'NODE_ENV').pipe(Config.withDefault('development')),
      logLevel: Config.LogLevel('LOG_LEVEL').pipe(Config.withDefault('Info')),
    }),
  )
}

export class QueueConfig extends Context.Service<
  QueueConfig,
  {
    readonly filename: string
    readonly lockExpiration: Duration.Duration
    readonly lockRefreshInterval: Duration.Duration
  }
>()('@oblik/config/QueueConfig') {
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
    }),
  )
}

export const MinimumLogLevelFromConfig = Layer.effect(
  References.MinimumLogLevel,
  Effect.map(RuntimeConfig, (config) => config.logLevel),
).pipe(Layer.provide(RuntimeConfig.layer))
