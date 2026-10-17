import { afterAll, describe, expect, test } from 'vitest'

import { routes } from '#api/http'

const server = Bun.serve({ port: 0, routes })
afterAll(() => server.stop(true))

const request = (path: string) => fetch(new URL(path, server.url))

describe('api routes', () => {
  test('GET /health reports ok', async () => {
    const response = await request('/health')

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: 'ok' })
  })
})
