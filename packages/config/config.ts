export const nodeEnvs = ['development', 'test', 'production'] as const
export const logLevels = ['debug', 'info', 'warn', 'error'] as const

export type NodeEnv = (typeof nodeEnvs)[number]
export type LogLevel = (typeof logLevels)[number]

export interface Config {
  readonly nodeEnv: NodeEnv
  readonly logLevel: LogLevel
  readonly api: { readonly port: number }
  readonly web: { readonly port: number }
}

export class ConfigError extends Error {
  constructor(readonly issues: readonly string[]) {
    super(`Invalid environment:\n${issues.map((issue) => `  - ${issue}`).join('\n')}`)
    this.name = 'ConfigError'
  }
}
