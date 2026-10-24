import { S3Service } from '@effect-aws/client-s3'
import { SQSService } from '@effect-aws/client-sqs'
import { ConfigProvider, Effect, Layer } from 'effect'
import { GenericContainer, Wait } from 'testcontainers'

import { AwsConfig, ministackImage } from '@app-template/config'

import { buildStage } from '#testing/stage.fixture'

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

/** S3 and SQS clients on a MiniStack container that lives as long as the layer: one per test file. */
export const AwsClientsMiniStack = Layer.unwrap(
  Effect.map(start, (container) => {
    const endpoint = new URL(`http://${container.getHost()}:${container.getMappedPort(port)}`).href
    return Layer.mergeAll(
      S3Service.layer({ endpoint, region, credentials, forcePathStyle: true }),
      SQSService.layer({ endpoint, region, credentials }),
    )
  }),
)

/**
 * `AwsConfig` on a stage no other test shares, read through a `ConfigProvider` once `provision`
 * has created the resources the test uses under it: provide it per test, so its buckets and
 * queues are its own and nothing needs cleaning.
 */
export const prepareOwnStage = <E, R>(provision: (stage: string) => Effect.Effect<unknown, E, R>) =>
  Layer.unwrap(
    Effect.gen(function* () {
      const stage = buildStage()

      yield* provision(stage)
      return AwsConfig.layer.pipe(
        Layer.provide(
          ConfigProvider.layer(ConfigProvider.fromUnknown({ AWS_REGION: region, STAGE: stage })),
        ),
      )
    }),
  )

/** The number of objects in `bucket`, for a test that checks what its own bucket holds. */
export const countObjects = (bucket: string) =>
  Effect.flatMap(S3Service, (s3) => s3.listObjectsV2({ Bucket: bucket })).pipe(
    Effect.map(({ Contents }) => Contents?.length ?? 0),
    Effect.orDie,
  )
