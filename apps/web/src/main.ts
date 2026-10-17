import { Effect, Layer } from 'effect'

import { ApiConfig, RuntimeConfig, WebConfig } from '@app-template/config'

import index from '#web/index.html'

const { api, web, runtime } = Effect.runSync(
  Effect.all({ api: ApiConfig, web: WebConfig, runtime: RuntimeConfig }).pipe(
    Effect.provide(Layer.mergeAll(ApiConfig.layer, WebConfig.layer, RuntimeConfig.layer)),
  ),
)
const apiOrigin = `http://localhost:${api.port}`

const proxyToApi = (request: Request): Promise<Response> => {
  const url = new URL(request.url)
  const target = new URL(url.pathname.replace(/^\/api/, '') + url.search, apiOrigin)
  return fetch(new Request(target, request))
}

const server = Bun.serve({
  port: web.port,
  routes: {
    '/': index,
    '/api/*': proxyToApi,
  },
  development: runtime.nodeEnv === 'development' && { hmr: true, console: true },
})

console.log(`web listening on ${server.url} (api proxied from ${apiOrigin})`)
