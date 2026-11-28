import { Config, Effect } from 'effect'

import index from '#web/index.html'

const config = Config.all({
  // The api's origin where the stack names it; beside a host api, its port on this machine.
  apiOrigin: Config.String('API_ORIGIN').pipe(
    Config.orElse(() =>
      Config.Port('API_PORT').pipe(Config.map((port) => `http://localhost:${port}`)),
    ),
  ),
  webPort: Config.Port('WEB_PORT'),
  nodeEnv: Config.Literals(['development', 'test', 'production'], 'NODE_ENV').pipe(
    Config.withDefault('development'),
  ),
}).pipe(Effect.runSync)
const { apiOrigin } = config

function proxyToApi(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const target = new URL(url.pathname.replace(/^\/api/, '') + url.search, apiOrigin)
  const proxied = new Request(target, request)
  // The browser's `Host` names this server; an api found by its host name must get its own.
  proxied.headers.delete('host')
  return fetch(proxied)
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
