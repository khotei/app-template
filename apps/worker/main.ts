import { BunRuntime } from '@effect/platform-bun'
import { Layer } from 'effect'

import { WorkerLayer } from '#worker/layer'

BunRuntime.runMain(Layer.launch(WorkerLayer))
