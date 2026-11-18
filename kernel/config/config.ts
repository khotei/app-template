import { Config, Layer, References } from 'effect'

export const apiPort = Config.Port('API_PORT')

export const workerPort = Config.Port('WORKER_PORT')

export const webPort = Config.Port('WEB_PORT')

export const databaseUrl = Config.Redacted('DATABASE_URL')

/** `endpoint` is set for MiniStack and absent on AWS; credentials stay with the SDK's own chain. */
export const awsConfig = Config.all({
  region: Config.String('AWS_REGION'),
  endpoint: Config.option(Config.URL('AWS_ENDPOINT_URL')),
  stage: Config.String('STAGE'),
})
export type AwsConfig = Config.Success<typeof awsConfig>

/** The local stand only: the host port MiniStack gives its first RDS instance. */
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

/** Anthropic's key and the models that answer replies and titles. */
export const llmConfig = Config.all({
  apiKey: Config.Redacted('ANTHROPIC_API_KEY'),
  replyModel: Config.String('LLM_REPLY_MODEL'),
  titleModel: Config.String('LLM_TITLE_MODEL'),
})
export type LlmConfig = Config.Success<typeof llmConfig>

export const MinimumLogLevelFromConfig = Layer.effect(References.MinimumLogLevel, logLevel)
