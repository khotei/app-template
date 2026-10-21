import { Context, Effect, Layer } from 'effect'
import { GenericContainer, Wait } from 'testcontainers'

/** The image `deployment/local/docker-compose.yml` runs; bump both together. */
const image =
  'ministackorg/ministack:1.5.29@sha256:88f507c57e16f5cac3c58dbdd4d47cfd14d6f870c38461aff7e077908253260b'
const port = 4566
const region = 'us-east-1'
const credentials = { accessKeyId: 'test', secretAccessKey: 'test' } as const

const start = Effect.acquireRelease(
  Effect.promise(() =>
    new GenericContainer(image)
      .withExposedPorts(port)
      .withEnvironment({ MINISTACK_REGION: region })
      .withWaitStrategy(Wait.forHttp('/_ministack/health', port))
      .start(),
  ),
  (container) => Effect.promise(() => container.stop()),
)

/** One MiniStack container per test file: the layer starts it and stops it with the scope. */
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
