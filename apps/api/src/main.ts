import { loadConfig } from '@oblik/config'
import { buildRoutes } from './http'
import { buildLayer } from './layer'

const config = loadConfig()
const server = Bun.serve({ port: config.api.port, routes: buildRoutes(buildLayer()) })

console.log(`api listening on ${server.url}`)
