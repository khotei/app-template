import { S3Service } from '@effect-aws/client-s3'
import { SQSService } from '@effect-aws/client-sqs'
import { Context, Effect, Layer } from 'effect'
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

/** One MiniStack container per test file. */
export class MiniStack extends Context.Service<
  MiniStack,
  {
    readonly endpoint: URL
    readonly region: string
    readonly credentials: { readonly accessKeyId: string; readonly secretAccessKey: string }
  }
>()('@app-template/testing/MiniStack') {
  static readonly layer = Layer.effect(
    this,
    Effect.map(start, (container) => ({
      endpoint: new URL(`http://${container.getHost()}:${container.getMappedPort(port)}`),
      region,
      credentials,
    })),
  )
}

/** S3 and SQS clients on the MiniStack container of the test file that provides this layer. */
export const AwsClientsMiniStack = Layer.unwrap(
  Effect.map(MiniStack, ({ endpoint, region, credentials }) =>
    Layer.mergeAll(
      S3Service.layer({ endpoint: endpoint.href, region, credentials, forcePathStyle: true }),
      SQSService.layer({ endpoint: endpoint.href, region, credentials }),
    ),
  ),
).pipe(Layer.provide(MiniStack.layer))
