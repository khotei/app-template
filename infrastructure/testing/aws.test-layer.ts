import { Effect, Layer, Option } from 'effect'
import { inject } from 'vitest'

import { provision, resources } from '@app-template/aws'
import { AwsConfig } from '@app-template/config'
import { generateStage, ministackRegion, S3ClientTest, SqsClientTest } from '@app-template/testing'

/**
 * A stage of its own per test on the run's MiniStack, its bucket and queues provisioned fresh.
 * Publishes the clients too, as the processes' `*FromConfig` layers do.
 */
export const AwsTest = Layer.unwrap(
  Effect.gen(function* () {
    const stage = generateStage()
    yield* provision(resources, stage)
    return Layer.succeed(AwsConfig, {
      region: ministackRegion,
      endpoint: Option.some(new URL(inject('awsEndpoint'))),
      stage,
    })
  }),
).pipe(Layer.provideMerge([SqsClientTest, S3ClientTest]))
