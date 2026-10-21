import {
  Config,
  Context,
  Duration,
  Effect,
  Layer,
  type LogLevel,
  type Option,
  References,
  Schema,
} from 'effect'

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

export class StoreConfig extends Context.Service<StoreConfig, { readonly path: string }>()(
  '@app-template/config/StoreConfig',
) {
  static readonly layer = Layer.effect(this, Config.all({ path: Config.String('STORE_PATH') }))
}

/** `endpoint` is set for MiniStack and absent on AWS; credentials stay with the SDK's own chain. */
export class AwsConfig extends Context.Service<
  AwsConfig,
  { readonly region: string; readonly endpoint: Option.Option<URL>; readonly stage: string }
>()('@app-template/config/AwsConfig') {
  static readonly layer = Layer.effect(
    this,
    Config.all({
      region: Config.String('AWS_REGION'),
      endpoint: Config.option(Config.URL('AWS_ENDPOINT_URL')),
      stage: Config.String('STAGE'),
    }),
  )
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

const isLockRefreshBeforeExpiration = (config: QueueConfig['Service']) =>
  Duration.isLessThan(config.lockRefreshInterval, config.lockExpiration)

const queueConfig = Config.all({
  filename: Config.String('QUEUE_SQLITE_PATH'),
  lockExpiration: Config.Duration('QUEUE_LOCK_EXPIRATION').pipe(
    Config.withDefault(Duration.seconds(15)),
  ),
  lockRefreshInterval: Config.Duration('QUEUE_LOCK_REFRESH_INTERVAL').pipe(
    Config.withDefault(Duration.seconds(5)),
  ),
}).pipe(
  Effect.filterOrFail(
    isLockRefreshBeforeExpiration,
    ({ lockExpiration, lockRefreshInterval }) =>
      new QueueLockRefreshIntervalInvalidError({ lockExpiration, lockRefreshInterval }),
  ),
)

export class QueueConfig extends Context.Service<
  QueueConfig,
  {
    readonly filename: string
    readonly lockExpiration: Duration.Duration
    readonly lockRefreshInterval: Duration.Duration
  }
>()('@app-template/config/QueueConfig') {
  static readonly layer = Layer.effect(this, queueConfig)
}

export const MinimumLogLevelFromConfig = Layer.effect(
  References.MinimumLogLevel,
  Effect.map(RuntimeConfig, (config) => config.logLevel),
).pipe(Layer.provide(RuntimeConfig.layer))
