import { ConfigProvider, Effect, Layer } from 'effect'
import { inject } from 'vitest'

import {
  generateStage,
  ministackRegion,
  S3ClientTest,
  SqsClientTest,
} from '@app-template/packages/aws/testing/e2e'

import { S3BucketOfStage } from '#kernel/aws/aws.client'
import { resources } from '#kernel/aws/resources/resources'
import { provision } from '#testing/aws/e2e/provision.test-util'

/**
 * A stage of its own per test on the run's MiniStack, its bucket and queues provisioned fresh.
 * Publishes the SDK clients too, which the kernel's `*FromConfig` layers keep closed, and the
 * stage's bucket.
 */
export const AwsTest = Layer.unwrap(
  Effect.gen(function* () {
    const stage = generateStage()
    yield* provision(resources, stage)
    return S3BucketOfStage.pipe(
      Layer.provideMerge(
        ConfigProvider.layer(
          ConfigProvider.fromUnknown({
            AWS_REGION: ministackRegion,
            AWS_ENDPOINT_URL: inject('awsEndpoint'),
            STAGE: stage,
          }),
        ),
      ),
    )
  }),
).pipe(Layer.provideMerge([SqsClientTest, S3ClientTest]))
