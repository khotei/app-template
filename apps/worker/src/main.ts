import { Effect } from 'effect'

import { RuntimeConfig } from '@app-template/config'

const maxTimerDelayMs = 2_147_483_647

const config = Effect.runSync(Effect.provide(RuntimeConfig, RuntimeConfig.layer))

setInterval(() => {}, maxTimerDelayMs)

console.log(`worker started (${config.nodeEnv}), idle`)
