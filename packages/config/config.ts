import {
  Config,
  Context,
  Duration,
  Effect,
  Layer,
  type LogLevel,
  type Option,
  type Redacted,
  References,
  Schema,
  Struct,
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

export class DatabaseConfig extends Context.Service<
  DatabaseConfig,
  { readonly url: Redacted.Redacted }
>()('@app-template/config/DatabaseConfig') {
  static readonly layer = Layer.effect(this, Config.all({ url: Config.Redacted('DATABASE_URL') }))
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

/** The local stand only: the host port MiniStack gives its first RDS instance. */
export class MiniStackConfig extends Context.Service<
  MiniStackConfig,
  { readonly rdsBasePort: number }
>()('@app-template/config/MiniStackConfig') {
  static readonly layer = Layer.effect(
    this,
    Config.all({ rdsBasePort: Config.Port('RDS_BASE_PORT') }),
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
  lockExpiration: Config.Duration('QUEUE_LOCK_EXPIRATION').pipe(
    Config.withDefault(Duration.seconds(15)),
  ),
  lockRefreshInterval: Config.Duration('QUEUE_LOCK_REFRESH_INTERVAL').pipe(
    Config.withDefault(Duration.seconds(5)),
  ),
  outboxPollInterval: Config.Duration('OUTBOX_POLL_INTERVAL').pipe(
    Config.withDefault(Duration.seconds(1)),
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
    readonly lockExpiration: Duration.Duration
    readonly lockRefreshInterval: Duration.Duration
    readonly outboxPollInterval: Duration.Duration
  }
>()('@app-template/config/QueueConfig') {
  static readonly layer = Layer.effect(this, queueConfig)
}

export const MinimumLogLevelFromConfig = RuntimeConfig.pipe(
  Effect.map(Struct.get('logLevel')),
  Layer.effect(References.MinimumLogLevel),
  Layer.provide(RuntimeConfig.layer),
)
