import { NodeRuntime } from '@effect/platform-node'
import { Layer } from 'effect'

import { ApiLayer } from '#api/layer'

NodeRuntime.runMain(Layer.launch(ApiLayer))
