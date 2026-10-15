import { loadConfig } from '@oblik/config'
import index from './index.html'

const config = loadConfig()
const apiOrigin = `http://localhost:${config.api.port}`

const proxyToApi = (request: Request): Promise<Response> => {
  const url = new URL(request.url)
  const target = new URL(url.pathname.replace(/^\/api/, '') + url.search, apiOrigin)
  return fetch(new Request(target, request))
}

const server = Bun.serve({
  port: config.web.port,
  routes: {
    '/': index,
    '/api/*': proxyToApi,
  },
  development: config.nodeEnv === 'development' && { hmr: true, console: true },
})

console.log(`web listening on ${server.url} (api proxied from ${apiOrigin})`)
