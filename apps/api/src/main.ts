import { loadConfig } from '@oblik/config'

import { buildRoutes } from '#api/http'
import { buildLayer } from '#api/layer'

const config = loadConfig()
const server = Bun.serve({ port: config.api.port, routes: buildRoutes(buildLayer()) })

console.log(`api listening on ${server.url}`)
