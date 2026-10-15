import { type Config, ConfigError, logLevels, nodeEnvs } from './config'

type Env = Readonly<Record<string, string | undefined>>

export const loadConfig = (env: Env = Bun.env): Config => {
  const issues: string[] = []
  const config: Config = {
    nodeEnv: readOneOf(env, 'NODE_ENV', nodeEnvs, 'development', issues),
    logLevel: readOneOf(env, 'LOG_LEVEL', logLevels, 'info', issues),
    api: { port: readPort(env, 'API_PORT', issues) },
    web: { port: readPort(env, 'WEB_PORT', issues) },
  }
  if (issues.length > 0) throw new ConfigError(issues)
  return config
}

const readOneOf = <T extends string>(
  env: Env,
  key: string,
  allowed: readonly T[],
  fallback: T,
  issues: string[],
): T => {
  const value = env[key]
  if (value === undefined || value === '') return fallback
  if ((allowed as readonly string[]).includes(value)) return value as T
  issues.push(`${key} must be one of ${allowed.join(', ')}, got "${value}"`)
  return fallback
}

const readPort = (env: Env, key: string, issues: string[]): number => {
  const value = env[key]
  if (value === undefined || value === '') {
    issues.push(`${key} is required`)
    return 0
  }
  const port = Number(value)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    issues.push(`${key} must be an integer port in 1..65535, got "${value}"`)
    return 0
  }
  return port
}
