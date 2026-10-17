import { Effect } from 'effect'

import { ApiConfig } from '@oblik/config'

import { createRoutes } from '#api/http'
import { createLayer } from '#api/layer'

const config = Effect.runSync(Effect.provide(ApiConfig, ApiConfig.layer))
const server = Bun.serve({ port: config.port, routes: createRoutes(createLayer()) })

console.log(`api listening on ${server.url}`)
