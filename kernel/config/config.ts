import {
  Config,
  Context,
  Effect,
  Layer,
  type LogLevel,
  type Option,
  type Redacted,
  References,
  Struct,
} from 'effect'

export class ApiConfig extends Context.Service<ApiConfig, { readonly port: number }>()(
  '@app-template/kernel/config/ApiConfig',
) {
  static readonly layer = Layer.effect(this, Config.all({ port: Config.Port('API_PORT') }))
}

export class WorkerConfig extends Context.Service<WorkerConfig, { readonly port: number }>()(
  '@app-template/kernel/config/WorkerConfig',
) {
  static readonly layer = Layer.effect(this, Config.all({ port: Config.Port('WORKER_PORT') }))
}

export class WebConfig extends Context.Service<WebConfig, { readonly port: number }>()(
  '@app-template/kernel/config/WebConfig',
) {
  static readonly layer = Layer.effect(this, Config.all({ port: Config.Port('WEB_PORT') }))
}

export class DatabaseConfig extends Context.Service<
  DatabaseConfig,
  { readonly url: Redacted.Redacted }
>()('@app-template/kernel/config/DatabaseConfig') {
  static readonly layer = Layer.effect(this, Config.all({ url: Config.Redacted('DATABASE_URL') }))
}

/** `endpoint` is set for MiniStack and absent on AWS; credentials stay with the SDK's own chain. */
export class AwsConfig extends Context.Service<
  AwsConfig,
  { readonly region: string; readonly endpoint: Option.Option<URL>; readonly stage: string }
>()('@app-template/kernel/config/AwsConfig') {
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
>()('@app-template/kernel/config/MiniStackConfig') {
  static readonly layer = Layer.effect(
    this,
    Config.all({ rdsBasePort: Config.Port('RDS_BASE_PORT') }),
  )
}

const nodeEnvs = ['development', 'test', 'production'] as const

export class RuntimeConfig extends Context.Service<
  RuntimeConfig,
  { readonly nodeEnv: (typeof nodeEnvs)[number]; readonly logLevel: LogLevel.LogLevel }
>()('@app-template/kernel/config/RuntimeConfig') {
  static readonly layer = Layer.effect(
    this,
    Config.all({
      nodeEnv: Config.Literals(nodeEnvs, 'NODE_ENV').pipe(Config.withDefault('development')),
      logLevel: Config.LogLevel('LOG_LEVEL').pipe(Config.withDefault('Info')),
    }),
  )
}

const llmProviders = ['stub', 'anthropic'] as const

type LlmProvider = (typeof llmProviders)[number]

const llmProvider = Config.Literals(llmProviders, 'LLM_PROVIDER')

const replyModel = Config.String('LLM_REPLY_MODEL')

type LlmSettings =
  | { readonly provider: 'stub' }
  | {
      readonly provider: 'anthropic'
      readonly apiKey: Redacted.Redacted
      readonly replyModel: string
      readonly titleModel: string
    }

const llmSettings = {
  stub: Config.succeed({ provider: 'stub' }),
  anthropic: Config.all({
    provider: Config.succeed('anthropic' as const),
    apiKey: Config.Redacted('ANTHROPIC_API_KEY'),
    replyModel,
    titleModel: Config.String('LLM_TITLE_MODEL'),
  }),
} as const satisfies Record<LlmProvider, Config.Config<LlmSettings>>

export class LlmConfig extends Context.Service<LlmConfig, LlmSettings>()(
  '@app-template/kernel/config/LlmConfig',
) {
  static readonly layer = Layer.effect(
    this,
    llmProvider.pipe(
      Config.flatMap((provider): Config.Config<LlmSettings> => llmSettings[provider]),
    ),
  )
}

type ReplyModelSettings = { readonly provider: LlmProvider; readonly replyModel: string }

const replyModelSettings = {
  stub: Config.succeed({ provider: 'stub', replyModel: 'stub' }),
  anthropic: Config.all({
    provider: Config.succeed('anthropic' as const),
    replyModel,
  }),
} as const satisfies Record<LlmProvider, Config.Config<ReplyModelSettings>>

/** The provider and the model that answer replies, read without the provider's key. */
export class ReplyModelConfig extends Context.Service<ReplyModelConfig, ReplyModelSettings>()(
  '@app-template/kernel/config/ReplyModelConfig',
) {
  static readonly layer = Layer.effect(
    this,
    llmProvider.pipe(
      Config.flatMap((provider): Config.Config<ReplyModelSettings> => replyModelSettings[provider]),
    ),
  )
}

export const MinimumLogLevelFromConfig = RuntimeConfig.pipe(
  Effect.map(Struct.get('logLevel')),
  Layer.effect(References.MinimumLogLevel),
  Layer.provide(RuntimeConfig.layer),
)
