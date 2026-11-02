import { Effect, Layer, Option } from 'effect'
import { inject } from 'vitest'

import { AwsConfig } from '@app-template/kernel/config'
import { provision } from '@app-template/packages/aws'
import {
  generateStage,
  ministackRegion,
  S3ClientTest,
  SqsClientTest,
} from '@app-template/packages/testing'

import { S3BucketOfStage } from '#kernel/aws/aws.client'
import { buildResourceName } from '#kernel/aws/resources/naming'
import { resources } from '#kernel/aws/resources/resources'

/**
 * A stage of its own per test on the run's MiniStack, its bucket and queues provisioned fresh.
 * Publishes the clients too, as the processes' `*FromConfig` layers do, and the stage's bucket.
 */
export const AwsTest = Layer.unwrap(
  Effect.gen(function* () {
    const stage = generateStage()
    yield* provision(resources, (name) => buildResourceName(stage, name))
    return S3BucketOfStage.pipe(
      Layer.provideMerge(
        Layer.succeed(AwsConfig, {
          region: ministackRegion,
          endpoint: Option.some(new URL(inject('awsEndpoint'))),
          stage,
        }),
      ),
    )
  }),
).pipe(Layer.provideMerge([SqsClientTest, S3ClientTest]))
