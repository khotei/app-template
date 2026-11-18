import { BunRuntime } from '@effect/platform-bun'
import { Layer } from 'effect'

import { ApiLayer } from '#api/layer'

BunRuntime.runMain(Layer.launch(ApiLayer))
