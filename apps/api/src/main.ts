import { Effect } from 'effect'

import { ApiConfig } from '@oblik/config'

import { routes } from '#api/http'

const config = Effect.runSync(Effect.provide(ApiConfig, ApiConfig.layer))
const server = Bun.serve({ port: config.port, routes })

console.log(`api listening on ${server.url}`)
