import { Config, Layer, References } from 'effect'

export const apiPort = Config.Port('API_PORT')

export const workerPort = Config.Port('WORKER_PORT')

export const databaseUrl = Config.Redacted('DATABASE_URL')

/** `endpoint` is set for MiniStack and absent on AWS; credentials stay with the SDK's own chain. */
export const awsConfig = Config.all({
  region: Config.String('AWS_REGION'),
  endpoint: Config.option(Config.URL('AWS_ENDPOINT_URL')),
  stage: Config.String('STAGE'),
})
export type AwsConfig = Config.Success<typeof awsConfig>

/** The local stand only: the host's TCP port MiniStack gives its first RDS instance. */
export const rdsBasePort = Config.Port('RDS_BASE_PORT')

/** The local stand only: where the telemetry backend takes OTLP and serves Grafana. */
export const telemetryConfig = Config.all({
  otlpEndpoint: Config.URL('OTEL_EXPORTER_OTLP_ENDPOINT'),
  grafanaPort: Config.Port('GRAFANA_PORT'),
})

export const nodeEnv = Config.Literals(['development', 'test', 'production'], 'NODE_ENV').pipe(
  Config.withDefault('development'),
)

export const logLevel = Config.LogLevel('LOG_LEVEL').pipe(Config.withDefault('Info'))

export const anthropicApiKey = Config.Redacted('ANTHROPIC_API_KEY')

/** The models that answer replies and titles. */
export const llmModels = Config.all({
  replyModel: Config.String('LLM_REPLY_MODEL'),
  titleModel: Config.String('LLM_TITLE_MODEL'),
})

/**
 * The tokens a chat's context may hold: at most the reply model's context window, lower to cut a
 * chat's context sooner.
 */
export const chatContextTokensLimit = Config.Int('LLM_CHAT_CONTEXT_TOKENS_LIMIT')

export const MinimumLogLevelFromConfig = Layer.effect(References.MinimumLogLevel, logLevel)
