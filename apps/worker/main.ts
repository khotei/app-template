import { NodeRuntime } from '@effect/platform-node'
import { Layer } from 'effect'

import { WorkerLayer } from '#worker/layer'

NodeRuntime.runMain(Layer.launch(WorkerLayer))
