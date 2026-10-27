import { SQSService } from '@effect-aws/client-sqs'
import { Effect, Layer } from 'effect'
import { GenericContainer, Wait } from 'testcontainers'

import { ministackImage } from '@app-template/config'

const port = 4566
const region = 'us-east-1'
const credentials = { accessKeyId: 'test', secretAccessKey: 'test' } as const

const start = Effect.acquireRelease(
  Effect.promise(() =>
    new GenericContainer(ministackImage)
      .withExposedPorts(port)
      .withEnvironment({ MINISTACK_REGION: region })
      .withWaitStrategy(Wait.forHttp('/_ministack/health', port))
      .start(),
  ),
  (container) => Effect.promise(() => container.stop()),
)

/** An SQS client on a MiniStack container that lives as long as the layer: one per test file. */
export const SqsClientTest = Layer.unwrap(
  Effect.map(start, (container) => {
    const endpoint = new URL(`http://${container.getHost()}:${container.getMappedPort(port)}`).href
    return SQSService.layer({ endpoint, region, credentials })
  }),
)
