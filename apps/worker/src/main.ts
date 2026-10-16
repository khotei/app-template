import { loadConfig } from '@oblik/config'

import { createLayer } from '#worker/layer'

const pollIntervalMs = 1_000

const config = loadConfig()
const layer = createLayer()

setInterval(() => {
  layer.pollOnce().catch((error: unknown) => console.error('worker poll failed', error))
}, pollIntervalMs)

console.log(`worker started (${config.nodeEnv}), polling every ${pollIntervalMs} ms`)
