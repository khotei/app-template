import { afterAll, describe, expect, test } from 'bun:test'

import { buildRoutes } from '#api/http'
import { buildLayer } from '#api/layer'

const server = Bun.serve({ port: 0, routes: buildRoutes(buildLayer()) })
afterAll(() => server.stop(true))

const request = (path: string, init?: RequestInit) => fetch(new URL(path, server.url), init)

const postExample = (body: unknown) =>
  request('/examples', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

describe('api routes', () => {
  test('GET /health reports ok', async () => {
    const response = await request('/health')

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: 'ok' })
  })

  test('POST /examples then GET /examples/:id round-trips', async () => {
    const created = await postExample({ name: 'First' })
    expect(created.status).toBe(201)
    const example = (await created.json()) as { id: string; name: string }

    const fetched = await request(`/examples/${example.id}`)

    expect(fetched.status).toBe(200)
    expect(await fetched.json()).toEqual(example)
  })

  test('GET /examples/:id answers 404 for an unknown id', async () => {
    const response = await request('/examples/missing')

    expect(response.status).toBe(404)
    expect(await response.json()).toMatchObject({ error: 'ExampleNotFoundError' })
  })

  test('POST /examples answers 422 for a blank name', async () => {
    const response = await postExample({ name: '   ' })

    expect(response.status).toBe(422)
    expect(await response.json()).toMatchObject({ error: 'ExampleNameInvalidError' })
  })

  test('POST /examples answers 400 for a malformed body', async () => {
    expect((await postExample({ title: 'First' })).status).toBe(400)
  })
})
