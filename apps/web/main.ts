import { Config, Effect } from 'effect'

import { apiPort, nodeEnv, webPort } from '@app-template/kernel/config'

import index from '#web/index.html'

const config = Config.all({ apiPort, webPort, nodeEnv }).pipe(Effect.runSync)
const apiOrigin = `http://localhost:${config.apiPort}`

function proxyToApi(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const target = new URL(url.pathname.replace(/^\/api/, '') + url.search, apiOrigin)
  return fetch(new Request(target, request))
}

const server = Bun.serve({
  port: config.webPort,
  routes: {
    '/': index,
    '/api/*': proxyToApi,
  },
  development: config.nodeEnv === 'development' && { hmr: true, console: true },
})

console.log(`web listening on ${server.url} (api proxied from ${apiOrigin})`)
