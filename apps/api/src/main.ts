import { loadConfig } from '@oblik/config'

import { createRoutes } from '#api/http'
import { createLayer } from '#api/layer'

const config = loadConfig()
const server = Bun.serve({ port: config.api.port, routes: createRoutes(createLayer()) })

console.log(`api listening on ${server.url}`)
