import { describe, expect, test } from 'bun:test'

import { ConfigError } from '#config/config'
import { loadConfig } from '#config/load'

const validEnv = {
  NODE_ENV: 'production',
  LOG_LEVEL: 'warn',
  API_PORT: '3000',
  WEB_PORT: '3001',
}

const issuesOf = (env: Record<string, string | undefined>): readonly string[] => {
  try {
    loadConfig(env)
  } catch (error) {
    if (error instanceof ConfigError) return error.issues
    throw error
  }
  throw new Error('expected loadConfig to throw ConfigError')
}

describe('loadConfig', () => {
  test('returns a typed config from a valid env', () => {
    expect(loadConfig(validEnv)).toEqual({
      nodeEnv: 'production',
      logLevel: 'warn',
      api: { port: 3000 },
      web: { port: 3001 },
    })
  })

  test('falls back to development and info when NODE_ENV and LOG_LEVEL are absent', () => {
    const config = loadConfig({ API_PORT: '3000', WEB_PORT: '3001' })

    expect(config.nodeEnv).toBe('development')
    expect(config.logLevel).toBe('info')
  })

  test('reports every offending variable in a single ConfigError', () => {
    const issues = issuesOf({ ...validEnv, API_PORT: undefined, LOG_LEVEL: 'loud' })

    expect(issues).toHaveLength(2)
    expect(issues.join('\n')).toContain('API_PORT')
    expect(issues.join('\n')).toContain('LOG_LEVEL')
  })

  test.each(['abc', '0', '70000', '3000.5'])('rejects the invalid port %p', (port) => {
    expect(issuesOf({ ...validEnv, WEB_PORT: port })).toEqual([expect.stringContaining('WEB_PORT')])
  })
})
